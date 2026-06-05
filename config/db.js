import mongoose from 'mongoose';

/**
 * Establishes an asynchronous connection to MongoDB using Mongoose.
 * Features automatic recovery and detailed stdout logging.
 */
const connectDB = async () => {
  try {
    // Keep bufferCommands enabled (default) so Mongoose queues queries
    // during brief reconnects instead of failing them immediately.
    // This prevents "server is offline" errors on transient network blips.

    const conn = await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/water-cms', {
      serverSelectionTimeoutMS: 10000, // 10s to tolerate cold-start / Atlas free-tier wake-up
    });

    console.log(`\x1b[32m%s\x1b[0m`, `✔ MongoDB Connected: ${conn.connection.host}`);

    // Auto-reconnect visibility — log when connection drops and recovers
    mongoose.connection.on('disconnected', () => {
      console.warn(`\x1b[33m%s\x1b[0m`, '⚠️  MongoDB disconnected. Mongoose will attempt to reconnect automatically...');
    });
    mongoose.connection.on('reconnected', () => {
      console.log(`\x1b[32m%s\x1b[0m`, '✔ MongoDB reconnected successfully.');
    });
    mongoose.connection.on('error', (err) => {
      console.error(`\x1b[31m%s\x1b[0m`, `✖ MongoDB runtime error: ${err.message}`);
    });

  } catch (error) {
    console.error(`\x1b[31m%s\x1b[0m`, `✖ MongoDB Connection Error: ${error.message}`);
    // Exit process with failure code if initial connection fails
    process.exit(1);
  }
};

/**
 * Executes a work function inside a managed Mongoose transaction session.
 * Automatically falls back to standard atomic operations if transactions are unsupported (e.g. standalone MongoDB).
 * 
 * @param {Function} work - The async function containing the DB operations, called as work(session)
 * @returns {Promise<any>}
 */
export const runInTransaction = async (work) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const result = await work(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    const isUnsupported =
      error.message.includes('Transaction numbers are only allowed on a replica set member') ||
      error.codeName === 'TransactionSystemFailed' ||
      error.message.includes('replica set') ||
      error.message.includes('sessions are not supported') ||
      error.message.includes('does not support sessions') ||
      error.code === 20 ||
      error.code === 263;

    if (isUnsupported) {
      console.warn('⚠️ Mongoose Transactions not supported in this environment (Standalone local MongoDB). Running fallback atomic operations.');
      try {
        await session.abortTransaction();
      } catch (e) { }
      await session.endSession();
      return await work(null);
    } else {
      try {
        await session.abortTransaction();
      } catch (e) { }
      throw error;
    }
  } finally {
    try {
      await session.endSession();
    } catch (e) { }
  }
};

/**
 * Synchronizes and balances the individual FIFO AdvancePayment records with the Customer's advanceBalance.
 * Corrects and allocates balances dynamically for all draws, payments, and reverts.
 * 
 * @param {string} customerId - Customer identifier
 * @param {number} newAdvanceBalance - The target total advance balance to sync against
 * @param {ClientSession|null} session - Active Mongoose session
 */
export const syncAdvancePrepayments = async (customerId, newAdvanceBalance, session) => {
  const AdvancePayment = mongoose.model('AdvancePayment');
  const targetBalance = Number(Number(newAdvanceBalance).toFixed(2));

  // Fetch all non-reverted prepayments in FIFO order (oldest first)
  const prepayments = await AdvancePayment.find({
    customer: customerId,
    status: { $ne: 'reverted' }
  }).sort({ createdAt: 1 }).session(session);

  let remainingToBalance = targetBalance;

  for (const prepay of prepayments) {
    if (remainingToBalance <= 0) {
      prepay.remainingAmount = 0;
      prepay.status = 'exhausted';
    } else if (remainingToBalance >= prepay.amount) {
      prepay.remainingAmount = prepay.amount;
      prepay.status = 'active';
      remainingToBalance = Number((remainingToBalance - prepay.amount).toFixed(2));
    } else {
      prepay.remainingAmount = remainingToBalance;
      prepay.status = 'active';
      remainingToBalance = 0;
    }
    await prepay.save({ session });
  }

  // Create a system adjustment prepayment record if there is excess balance not backed by existing records
  if (remainingToBalance > 0) {
    await AdvancePayment.create([{
      customer: customerId,
      amount: remainingToBalance,
      remainingAmount: remainingToBalance,
      status: 'active',
      notes: 'System adjustment / starting advance balance'
    }], { session });
  }
};

export default connectDB;


