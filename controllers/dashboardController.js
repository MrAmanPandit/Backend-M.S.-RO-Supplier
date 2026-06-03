import Customer from '../models/Customer.js';
import DeliveryRecord from '../models/DeliveryRecord.js';

/**
 * @desc    Fetch administrative dashboard telemetry statistics
 * @route   GET /api/dashboard/stats
 * @access  Private (Admin/Supervisor)
 */
export const getDashboardStats = async (req, res) => {
  try {
    // 1. Total Customers Count
    const totalCustomers = await Customer.countDocuments();

    // 2. High-performance due balance aggregation
    const dueAmountAggregate = await Customer.aggregate([
      {
        $group: {
          _id: null,
          totalDues: { $sum: '$dueAmount' },
        },
      },
    ]);
    const totalDues = dueAmountAggregate.length > 0 ? dueAmountAggregate[0].totalDues : 0;

    // 3. Define date boundary for "Today" using local date string format YYYY-MM-DD in IST
    const today = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' });
    const todayDateString = formatter.format(today);

    // 4. Today's Delivery counts supporting both casing formats ('delivered' / 'Delivered')
    const todayDeliveriesCount = await DeliveryRecord.countDocuments({
      deliveryDateString: todayDateString,
      status: { $in: ['delivered', 'Delivered'] },
    });

    // 5. Today's volumetric can supply aggregate supporting both casing formats
    const todayCansAggregate = await DeliveryRecord.aggregate([
      {
        $match: {
          deliveryDateString: todayDateString,
          status: { $in: ['delivered', 'Delivered'] },
        },
      },
      {
        $group: {
          _id: null,
          totalCans: { $sum: '$numberOfCans' },
          totalRevenue: { $sum: '$amountCharged' },
        },
      },
    ]);

    const todayCans = todayCansAggregate.length > 0 ? todayCansAggregate[0].totalCans : 0;
    const todayRevenue = todayCansAggregate.length > 0 ? todayCansAggregate[0].totalRevenue : 0;


    res.status(200).json({
      status: 'success',
      data: {
        totalCustomers,
        totalDues,
        todayDeliveriesCount,
        todayCans,
        todayRevenue,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error(`\x1b[31m[Get Stats Error] %s\x1b[0m`, error.stack);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error while compiling dashboard statistics',
    });
  }
};
