import DeliveryRecord from '../models/DeliveryRecord.js';
import Customer from '../models/Customer.js';
import mongoose from 'mongoose';
import { runInTransaction, syncAdvancePrepayments } from '../config/db.js';

/**
 * @desc    Log a new delivery and update customer stats atomically
 * @route   POST /api/deliveries
 * @access  Private (Admin/Supervisor)
 */
export const addDelivery = async (req, res) => {
  try {
    const { customer: customerId, numberOfCans, amountCharged, status, notes } = req.body;

    // Pre-validate customer exists outside transaction for faster early rejection
    const customerCheck = await Customer.findById(customerId);
    if (!customerCheck) {
      return res.status(404).json({
        status: 'error',
        message: 'Associated customer record not found',
      });
    }

    const delivery = await runInTransaction(async (session) => {
      const customer = await Customer.findById(customerId).session(session);

      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const deliveryDateString = `${year}-${month}-${day}`;

      const normalizedStatus = status ? status.toLowerCase() : 'delivered';

      // Calculate charges with smart plan fallback
      const cansCount = Number(numberOfCans) || 1;
      const planPrices = { 'Budget': 20, 'Standard': 40, 'Premium': 50 };

      let pricePerCan = customer.pricePerCan;
      if (pricePerCan === undefined || pricePerCan === null || (pricePerCan === 40 && customer.waterPlan !== 'Standard')) {
        pricePerCan = planPrices[customer.waterPlan] !== undefined ? planPrices[customer.waterPlan] : 20;
      }

      const calculatedAmountCharged = amountCharged !== undefined ? amountCharged : (cansCount * pricePerCan);
      const calculatedDeliveryCharge = customer.deliveryCharge || 0;
      const totalAmount = normalizedStatus === 'delivered' ? (calculatedAmountCharged + calculatedDeliveryCharge) : 0;

      // Snapshot for rollback integrity
      const previousDue = customer.dueAmount || 0;
      const previousAdvance = customer.advanceBalance || 0;

      const deliveryDoc = new DeliveryRecord({
        customer: customerId,
        customerName: customer.customerName,
        deliveryDate: new Date(),
        deliveryDateString,
        numberOfCans: cansCount,
        amountCharged: normalizedStatus === 'delivered' ? calculatedAmountCharged : 0,
        deliveryCharge: normalizedStatus === 'delivered' ? calculatedDeliveryCharge : 0,
        totalAmount,
        status: normalizedStatus,
        deliveredBy: req.user._id,
        notes,
        previousDue,
        previousAdvance,
      });

      // Update customer stats if status is 'delivered'
      if (normalizedStatus === 'delivered') {
        customer.totalCansSupplied += cansCount;

        if (customer.advanceBalance > 0) {
          if (customer.advanceBalance >= totalAmount) {
            customer.advanceBalance = Number((customer.advanceBalance - totalAmount).toFixed(2));
            deliveryDoc.notes = notes ? `${notes} (Paid from advance: ₹${totalAmount})` : `Paid from advance: ₹${totalAmount}`;
          } else {
            const remainingDuesToAdd = Number((totalAmount - customer.advanceBalance).toFixed(2));
            const oldAdvance = customer.advanceBalance;
            customer.advanceBalance = 0;
            customer.dueAmount = Number((customer.dueAmount + remainingDuesToAdd).toFixed(2));
            deliveryDoc.notes = notes
              ? `${notes} (Used ₹${oldAdvance} advance. Due increased by ₹${remainingDuesToAdd})`
              : `Used ₹${oldAdvance} advance. Due increased by ₹${remainingDuesToAdd}`;
          }
        } else {
          customer.dueAmount = Number((customer.dueAmount + totalAmount).toFixed(2));
        }
      }

      deliveryDoc.dueAmountAfterDelivery = customer.dueAmount;
      deliveryDoc.advanceBalanceAfterDelivery = customer.advanceBalance;

      await deliveryDoc.save({ session });
      await customer.save({ session });

      // Sync FIFO prepayment ledger to match the new advance balance
      await syncAdvancePrepayments(customerId, customer.advanceBalance, session);

      return deliveryDoc;
    });

    res.status(201).json({
      status: 'success',
      message: 'Delivery record logged and customer metrics updated successfully',
      data: delivery,
    });
  } catch (error) {
    console.error(`\x1b[31m[Add Delivery Error] %s\x1b[0m`, error.stack);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error while logging delivery',
    });
  }
};

/**
 * @desc    Fetch delivery logs history
 * @route   GET /api/deliveries/history
 * @access  Private (Admin/Supervisor/Customer)
 */
export const getDeliveryHistory = async (req, res) => {
  try {
    const { customerId, startDate, endDate } = req.query;
    const filter = {};

    // Filter by customer if provided
    if (customerId) {
      filter.customer = customerId;
    }

    // Filter by date range if provided
    if (startDate || endDate) {
      filter.deliveryDate = {};
      if (startDate) {
        filter.deliveryDate.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.deliveryDate.$lte = new Date(endDate);
      }
    }

    // Retrieve deliveries in reverse chronological order
    const deliveries = await DeliveryRecord.find(filter)
      .populate('customer', 'customerName phoneNumber')
      .populate('deliveredBy', 'name role')
      .sort({ deliveryDate: -1 })
      .lean();

    res.status(200).json({
      status: 'success',
      count: deliveries.length,
      data: deliveries,
    });
  } catch (error) {
    console.error(`\x1b[31m[Get History Error] %s\x1b[0m`, error.stack);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error while retrieving delivery history',
    });
  }
};

/**
 * @desc    Update delivery record status (handles due rollbacks on cancellations)
 * @route   PUT /api/deliveries/:id
 * @access  Private (Admin/Supervisor)
 */
export const updateDelivery = async (req, res) => {
  try {
    const deliveryId = req.params.id;
    const { status, notes } = req.body;

    // Pre-validate outside transaction for fast rejection
    const deliveryCheck = await DeliveryRecord.findById(deliveryId);
    if (!deliveryCheck) {
      return res.status(404).json({ status: 'error', message: 'Delivery record not found' });
    }
    const customerCheck = await Customer.findById(deliveryCheck.customer);
    if (!customerCheck) {
      return res.status(404).json({ status: 'error', message: 'Associated customer record not found' });
    }

    const updatedDelivery = await runInTransaction(async (session) => {
      const delivery = await DeliveryRecord.findById(deliveryId).session(session);
      const customer = await Customer.findById(delivery.customer).session(session);

      const oldStatus = delivery.status.toLowerCase();
      const newStatus = status ? status.toLowerCase() : oldStatus;

      if (newStatus && newStatus !== oldStatus) {
        // Rollback customer balances to the snapshot before this delivery was made
        customer.dueAmount = delivery.previousDue;
        customer.advanceBalance = delivery.previousAdvance;

        if (oldStatus === 'delivered') {
          customer.totalCansSupplied = Math.max(0, customer.totalCansSupplied - delivery.numberOfCans);
        }

        const previousDue = customer.dueAmount;
        const previousAdvance = customer.advanceBalance;

        if (newStatus === 'delivered') {
          customer.totalCansSupplied += delivery.numberOfCans;

          if (customer.advanceBalance > 0) {
            if (customer.advanceBalance >= delivery.totalAmount) {
              customer.advanceBalance = Number((customer.advanceBalance - delivery.totalAmount).toFixed(2));
            } else {
              const remainingDuesToAdd = Number((delivery.totalAmount - customer.advanceBalance).toFixed(2));
              customer.advanceBalance = 0;
              customer.dueAmount = Number((customer.dueAmount + remainingDuesToAdd).toFixed(2));
            }
          } else {
            customer.dueAmount = Number((customer.dueAmount + delivery.totalAmount).toFixed(2));
          }
        }

        delivery.previousDue = previousDue;
        delivery.previousAdvance = previousAdvance;
        delivery.dueAmountAfterDelivery = customer.dueAmount;
        delivery.advanceBalanceAfterDelivery = customer.advanceBalance;
        delivery.status = newStatus;

        await customer.save({ session });

        // Sync FIFO prepayment ledger after balance change
        await syncAdvancePrepayments(customer._id.toString(), customer.advanceBalance, session);
      }

      if (notes) delivery.notes = notes;
      const savedDelivery = await delivery.save({ session });
      return savedDelivery;
    });

    res.status(200).json({
      status: 'success',
      message: `Delivery status updated`,
      data: updatedDelivery,
    });
  } catch (error) {
    console.error(`\x1b[31m[Update Delivery Error] %s\x1b[0m`, error.stack);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error during delivery update',
    });
  }
};

/**
 * @desc    Get all customers with today's delivery status for the daily update page
 * @route   GET /api/deliveries/daily-customers
 * @access  Private (Admin/Supervisor)
 */
export const getDailyCustomers = async (req, res) => {
  try {
    // Get start and end of today
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const deliveryDateString = `${year}-${month}-${day}`;

    // Fetch all active customers with their customized pricing details
    const customers = await Customer.find({})
      .select('customerName phoneNumber dueAmount waterPlan address pricePerCan deliveryCharge monthlyRate totalCansSupplied advanceBalance')
      .sort({ customerName: 1 })
      .lean();

    // Fetch today's delivery records using date key
    const todayDeliveries = await DeliveryRecord.find({
      deliveryDateString,
    })
      .select('customer status numberOfCans amountCharged deliveryCharge totalAmount')
      .lean();

    // Map today's status onto each customer
    const deliveryMap = {};
    todayDeliveries.forEach((d) => {
      deliveryMap[d.customer.toString()] = d;
    });

    const customersWithStatus = customers.map((c) => ({
      ...c,
      todayDelivery: deliveryMap[c._id.toString()] || null,
    }));

    res.status(200).json({
      status: 'success',
      count: customersWithStatus.length,
      data: customersWithStatus,
    });
  } catch (error) {
    console.error(`\x1b[31m[Get Daily Customers Error] %s\x1b[0m`, error.stack);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error while fetching daily customers',
    });
  }
};

/**
 * @desc    Log a quick delivered / not-delivered status for the daily update page
 * @route   POST /api/deliveries/daily-update
 * @access  Private (Admin/Supervisor)
 */
export const logDailyDelivery = async (req, res) => {
  try {
    const { customerId, deliveryStatus, numberOfCans: reqNumberOfCans } = req.body;

    if (!customerId || !deliveryStatus) {
      return res.status(400).json({
        status: 'error',
        message: 'customerId and deliveryStatus are required',
      });
    }

    const inputStatus = deliveryStatus.toLowerCase();

    if (!['delivered', 'not_delivered', 'pending'].includes(inputStatus)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid delivery status. Must be delivered, not_delivered, or pending',
      });
    }

    // Pre-validate customer exists
    const customerCheck = await Customer.findById(customerId);
    if (!customerCheck) {
      return res.status(404).json({ status: 'error', message: 'Customer not found' });
    }

    const responseData = await runInTransaction(async (session) => {
      const customer = await Customer.findById(customerId).session(session);

      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const deliveryDateString = `${year}-${month}-${day}`;

      // Upsert: check if today's record already exists
      let record = await DeliveryRecord.findOne({ customer: customerId, deliveryDateString }).session(session);

      // ── PENDING (UNDO) HANDLER ─────────────────────────────────────────────
      if (inputStatus === 'pending') {
        if (record) {
          // Restore customer balances using the pre-delivery snapshot
          customer.dueAmount = record.previousDue;
          customer.advanceBalance = record.previousAdvance;

          if (record.status === 'delivered') {
            customer.totalCansSupplied = Math.max(0, customer.totalCansSupplied - record.numberOfCans);
          }

          await DeliveryRecord.deleteOne({ _id: record._id }).session(session);
        }

        await customer.save({ session });
        // Sync FIFO prepayments to restored advance balance
        await syncAdvancePrepayments(customerId, customer.advanceBalance, session);

        return {
          delivery: null,
          customer: {
            _id: customer._id,
            customerName: customer.customerName,
            dueAmount: customer.dueAmount,
            advanceBalance: customer.advanceBalance,
            totalCansSupplied: customer.totalCansSupplied,
            waterPlan: customer.waterPlan,
            pricePerCan: customer.pricePerCan,
            deliveryCharge: customer.deliveryCharge,
          },
          resetToPending: true,
        };
      }

      // ── CALCULATE CHARGES ─────────────────────────────────────────────────
      let numberOfCans = reqNumberOfCans !== undefined && reqNumberOfCans !== null ? Number(reqNumberOfCans) : 1;

      const planPrices = { 'Budget': 20, 'Standard': 40, 'Premium': 50 };
      let pricePerCan = customer.pricePerCan;
      if (pricePerCan === undefined || pricePerCan === null || (pricePerCan === 40 && customer.waterPlan !== 'Standard')) {
        pricePerCan = planPrices[customer.waterPlan] !== undefined ? planPrices[customer.waterPlan] : 20;
      }

      const customerDeliveryCharge = customer.deliveryCharge || 0;
      const amountCharged = inputStatus === 'delivered' ? (numberOfCans * pricePerCan) : 0;
      const deliveryCharge = inputStatus === 'delivered' ? customerDeliveryCharge : 0;
      const totalAmount = amountCharged + deliveryCharge;

      // ── ROLLBACK PREVIOUS IF RECORD EXISTS ────────────────────────────────
      let previousDue = customer.dueAmount;
      let previousAdvance = customer.advanceBalance;

      if (record) {
        // Roll back customer to before this delivery record was created
        customer.dueAmount = record.previousDue;
        customer.advanceBalance = record.previousAdvance;

        if (record.status === 'delivered') {
          customer.totalCansSupplied = Math.max(0, customer.totalCansSupplied - record.numberOfCans);
        }

        previousDue = customer.dueAmount;
        previousAdvance = customer.advanceBalance;

        record.status = inputStatus;
        record.numberOfCans = numberOfCans;
        record.amountCharged = amountCharged;
        record.deliveryCharge = deliveryCharge;
        record.totalAmount = totalAmount;
        record.customerName = customer.customerName;
        record.deliveredBy = req.user._id;
        record.notes = `Daily update — ${inputStatus}`;
        record.previousDue = previousDue;
        record.previousAdvance = previousAdvance;
      } else {
        // Capture delivery timestamp as formatted string for calendar display
        const nowTime = new Date();
        const hours = nowTime.getHours();
        const minutes = String(nowTime.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const formattedHour = String(hours % 12 || 12).padStart(2, '0');
        const deliveryTime = inputStatus === 'delivered' ? `${formattedHour}:${minutes} ${ampm}` : null;

        record = new DeliveryRecord({
          customer: customerId,
          customerName: customer.customerName,
          deliveryDate: new Date(),
          deliveryDateString,
          numberOfCans,
          amountCharged,
          deliveryCharge,
          totalAmount,
          status: inputStatus,
          deliveredBy: req.user._id,
          deliveredByName: req.user.name || null,
          deliveryTime,
          notes: `Daily update — ${inputStatus}`,
          previousDue,
          previousAdvance,
        });
      }

      // ── APPLY NEW DELIVERY BALANCE CHANGES ───────────────────────────────
      if (inputStatus === 'delivered') {
        customer.totalCansSupplied += numberOfCans;

        if (customer.advanceBalance > 0) {
          if (customer.advanceBalance >= totalAmount) {
            customer.advanceBalance = Number((customer.advanceBalance - totalAmount).toFixed(2));
            record.notes = `Daily update — delivered (Used ₹${totalAmount} from advance)`;
          } else {
            const remainingDuesToAdd = Number((totalAmount - customer.advanceBalance).toFixed(2));
            const oldAdvance = customer.advanceBalance;
            customer.advanceBalance = 0;
            customer.dueAmount = Number((customer.dueAmount + remainingDuesToAdd).toFixed(2));
            record.notes = `Daily update — delivered (Used ₹${oldAdvance} advance. Due added: ₹${remainingDuesToAdd})`;
          }
        } else {
          customer.dueAmount = Number((customer.dueAmount + totalAmount).toFixed(2));
        }
      }

      record.dueAmountAfterDelivery = customer.dueAmount;
      record.advanceBalanceAfterDelivery = customer.advanceBalance;

      await record.save({ session });
      await customer.save({ session });

      // Sync FIFO prepayment ledger
      await syncAdvancePrepayments(customerId, customer.advanceBalance, session);

      return {
        delivery: record,
        customer: {
          _id: customer._id,
          customerName: customer.customerName,
          dueAmount: customer.dueAmount,
          advanceBalance: customer.advanceBalance,
          totalCansSupplied: customer.totalCansSupplied,
          waterPlan: customer.waterPlan,
          pricePerCan: customer.pricePerCan,
          deliveryCharge: customer.deliveryCharge,
        },
      };
    });

    if (responseData.resetToPending) {
      return res.status(200).json({
        status: 'success',
        message: `Delivery status reset to Pending for ${responseData.customer.customerName}`,
        data: responseData,
      });
    }

    res.status(200).json({
      status: 'success',
      message: `Delivery status saved: ${inputStatus} for ${responseData.customer.customerName}`,
      data: responseData,
    });
  } catch (error) {
    console.error(`\x1b[31m[Log Daily Delivery Error] %s\x1b[0m`, error.stack);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error while logging daily delivery',
    });
  }
};

/**
 * @desc    Get monthly delivery calendar data for the logged-in customer
 * @route   GET /api/deliveries/calendar?month=YYYY-MM
 * @access  Private (Customer self-service)
 */
export const getCustomerCalendar = async (req, res) => {
  try {
    const customerId = req.user._id;

    // Parse requested month or default to current month
    let year, month;
    if (req.query.month && /^\d{4}-\d{2}$/.test(req.query.month)) {
      [year, month] = req.query.month.split('-').map(Number);
    } else {
      const now = new Date();
      year = now.getFullYear();
      month = now.getMonth() + 1;
    }

    // Build date string prefix for the month e.g. "2026-06"
    const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;

    // Fetch all delivery records for this customer in the requested month
    const records = await DeliveryRecord.find({
      customer: customerId,
      deliveryDateString: { $regex: `^${monthPrefix}` },
    })
      .select('deliveryDateString status numberOfCans deliveryTime deliveredByName notes')
      .sort({ deliveryDateString: 1 })
      .lean();

    // Shape records for the calendar UI
    const calendarData = records.map((r) => ({
      date: r.deliveryDateString,
      status: r.status,
      numberOfCans: r.numberOfCans,
      deliveryTime: r.deliveryTime || null,
      deliveredBy: r.deliveredByName || null,
      notes: r.notes || null,
    }));

    res.status(200).json({
      status: 'success',
      month: monthPrefix,
      count: calendarData.length,
      data: calendarData,
    });
  } catch (error) {
    console.error(`\x1b[31m[Get Customer Calendar Error] %s\x1b[0m`, error.stack);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error while fetching calendar data',
    });
  }
};
