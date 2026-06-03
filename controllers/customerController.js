import Customer from '../models/Customer.js';
import { runInTransaction } from '../config/db.js';
import AdvancePayment from '../models/AdvancePayment.js';

/**
 * @desc    Create a new customer profile
 * @route   POST /api/customers
 * @access  Private (Admin/Supervisor)
 */
export const addCustomer = async (req, res) => {
  try {
    const { 
      customerName, 
      phoneNumber, 
      address, 
      waterPlan, 
      pricePerCan, 
      deliveryCharge, 
      monthlyRate, 
      advanceBalance, 
      totalCansSupplied, 
      password 
    } = req.body;

    // Check if customer already exists with phone
    const exists = await Customer.findOne({ phoneNumber });
    if (exists) {
      return res.status(400).json({
        status: 'error',
        message: 'A customer with this phone number is already registered',
      });
    }

    // Set intelligent defaults for pricing based on plan if not provided
    let calculatedPricePerCan = pricePerCan;
    if (calculatedPricePerCan === undefined || calculatedPricePerCan === null) {
      const planPrices = {
        'Budget': 20,
        'Standard': 40,
        'Premium': 50,
      };
      calculatedPricePerCan = planPrices[waterPlan] !== undefined ? planPrices[waterPlan] : 20;
    }

    const startingAdvance = Number(advanceBalance) || 0;

    const customer = await runInTransaction(async (session) => {
      const newCustomer = await Customer.create([{
        customerName,
        phoneNumber,
        address,
        waterPlan,
        pricePerCan: calculatedPricePerCan,
        deliveryCharge: deliveryCharge !== undefined ? deliveryCharge : 0,
        monthlyRate: monthlyRate !== undefined ? monthlyRate : 0,
        dueAmount: 0,
        advanceBalance: startingAdvance,
        totalCansSupplied: totalCansSupplied || 0,
        password: password || `${customerName.replace(/[^a-zA-Z]/g, '').substring(0, 4)}${phoneNumber.replace(/[^0-9]/g, '').substring(0, 4)}` || '123456',
        createdBy: req.user._id, // Set by protect middleware
      }], { session });

      const customerDoc = newCustomer[0];

      if (startingAdvance > 0) {
        await AdvancePayment.create([{
          customer: customerDoc._id,
          amount: startingAdvance,
          remainingAmount: startingAdvance,
          status: 'active',
          notes: 'Starting advance balance on registration'
        }], { session });
      }

      return customerDoc;
    });

    res.status(201).json({
      status: 'success',
      message: 'Customer profile registered successfully',
      data: customer,
    });
  } catch (error) {
    console.error(`\x1b[31m[Add Customer Error] %s\x1b[0m`, error.stack);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error while enrolling customer',
    });
  }
};


/**
 * @desc    Fetch and query customer accounts
 * @route   GET /api/customers
 * @access  Private (Admin/Supervisor/Customer)
 */
export const getCustomers = async (req, res) => {
  try {
    const { search, area, plan } = req.query;
    const filter = {};

    // Apply area filter
    if (area) {
      filter['address.area'] = { $regex: area, $options: 'i' };
    }

    // Apply plan filter
    if (plan) {
      filter.waterPlan = plan;
    }

    // Apply fuzzy search
    if (search) {
      filter.$or = [
        { customerName: { $regex: search, $options: 'i' } },
        { phoneNumber: { $regex: search, $options: 'i' } },
        { 'address.street': { $regex: search, $options: 'i' } },
      ];
    }

    // High performance lean fetch sorted alphabetically
    const customers = await Customer.find(filter)
      .select('-password')
      .sort({ customerName: 1 })
      .lean();

    res.status(200).json({
      status: 'success',
      count: customers.length,
      data: customers,
    });
  } catch (error) {
    console.error(`\x1b[31m[Get Customers Error] %s\x1b[0m`, error.stack);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error while retrieving customer listings',
    });
  }
};

/**
 * @desc    Get single customer profile by ID
 * @route   GET /api/customers/:id
 * @access  Private (Admin/Supervisor/Customer)
 */
export const getCustomerById = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id)
      .select('-password')
      .populate('createdBy', 'name email role');

    if (!customer) {
      return res.status(404).json({
        status: 'error',
        message: 'Customer record not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: customer,
    });
  } catch (error) {
    console.error(`\x1b[31m[Get Customer By ID Error] %s\x1b[0m`, error.stack);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error while retrieving customer profile',
    });
  }
};

/**
 * @desc    Update customer profile details
 * @route   PUT /api/customers/:id
 * @access  Private (Admin/Supervisor)
 */
export const updateCustomer = async (req, res) => {
  try {
    const { customerName, phoneNumber, address, waterPlan, pricePerCan, deliveryCharge, monthlyRate } = req.body;

    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({
        status: 'error',
        message: 'Customer record not found',
      });
    }

    // Verify phone conflict if changed
    if (phoneNumber && phoneNumber !== customer.phoneNumber) {
      const conflict = await Customer.findOne({ phoneNumber });
      if (conflict) {
        return res.status(400).json({
          status: 'error',
          message: 'This phone number is already assigned to another customer profile',
        });
      }
      customer.phoneNumber = phoneNumber;
    }

    if (customerName) customer.customerName = customerName;
    if (address) customer.address = { ...customer.address, ...address };
    if (waterPlan) customer.waterPlan = waterPlan;
    if (pricePerCan !== undefined) customer.pricePerCan = pricePerCan;
    if (deliveryCharge !== undefined) customer.deliveryCharge = deliveryCharge;
    if (monthlyRate !== undefined) customer.monthlyRate = monthlyRate;

    const updatedCustomer = await customer.save();

    res.status(200).json({
      status: 'success',
      message: 'Customer profile updated successfully',
      data: updatedCustomer,
    });
  } catch (error) {
    console.error(`\x1b[31m[Update Customer Error] %s\x1b[0m`, error.stack);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error during customer update',
    });
  }
};

/**
 * @desc    Delete customer profile
 * @route   DELETE /api/customers/:id
 * @access  Private (Admin Only)
 */
export const deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({
        status: 'error',
        message: 'Customer record not found',
      });
    }

    await Customer.findByIdAndDelete(req.params.id);

    res.status(200).json({
      status: 'success',
      message: 'Customer profile deleted successfully',
    });
  } catch (error) {
    console.error(`\x1b[31m[Delete Customer Error] %s\x1b[0m`, error.stack);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error during customer deletion',
    });
  }
};

/**
 * @desc    Update or clear customer due balance
 * @route   PUT /api/customers/:id/dues
 * @access  Private (Admin/Supervisor)
 */
export const updateCustomerDues = async (req, res) => {
  try {
    const { action, amount } = req.body; // action: 'increment' | 'decrement' | 'clear'
    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return res.status(404).json({
        status: 'error',
        message: 'Customer record not found',
      });
    }

    if (action === 'clear') {
      customer.dueAmount = 0;
    } else if (action === 'increment') {
      if (!amount || amount <= 0) {
        return res.status(400).json({ status: 'error', message: 'Valid positive amount is required' });
      }
      customer.dueAmount += amount;
    } else if (action === 'decrement') {
      if (!amount || amount <= 0) {
        return res.status(400).json({ status: 'error', message: 'Valid positive amount is required' });
      }
      customer.dueAmount = Math.max(0, customer.dueAmount - amount);
    } else {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid dues action. Allowed actions are: increment, decrement, clear',
      });
    }

    await customer.save();

    res.status(200).json({
      status: 'success',
      message: `Customer dues updated successfully via ${action}`,
      dueAmount: customer.dueAmount,
    });
  } catch (error) {
    console.error(`\x1b[31m[Update Dues Error] %s\x1b[0m`, error.stack);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error during due balance adjustment',
    });
  }
};
