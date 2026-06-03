import Admin from '../models/Admin.js';

/**
 * @desc    Get all admin/supervisor staff members
 * @route   GET /api/admins
 * @access  Private (Admin only)
 */
export const getAdmins = async (req, res) => {
  try {
    const admins = await Admin.find({}).select('-password').sort({ createdAt: -1 });
    res.status(200).json({
      status: 'success',
      count: admins.length,
      data: admins,
    });
  } catch (error) {
    console.error(`\x1b[31m[Get Admins Error] %s\x1b[0m`, error.stack);
    res.status(500).json({
      status: 'error',
      message: 'Server Error',
    });
  }
};

/**
 * @desc    Add a new admin/supervisor staff member
 * @route   POST /api/admins
 * @access  Private (Admin only)
 */
export const addAdmin = async (req, res) => {
  try {
    const { name, email, mobile, password, role } = req.body;

    const emailExists = await Admin.findOne({ email });
    if (emailExists) {
      return res.status(400).json({ status: 'error', message: 'Staff member with this email already exists' });
    }

    const mobileExists = await Admin.findOne({ mobile });
    if (mobileExists) {
      return res.status(400).json({ status: 'error', message: 'Staff member with this mobile already exists' });
    }

    const admin = await Admin.create({
      name,
      email,
      mobile,
      password,
      role: role || 'supervisor',
    });

    res.status(201).json({
      status: 'success',
      data: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        mobile: admin.mobile,
        role: admin.role,
        isActive: admin.isActive
      },
    });
  } catch (error) {
    console.error(`\x1b[31m[Add Admin Error] %s\x1b[0m`, error.stack);
    res.status(500).json({
      status: 'error',
      message: 'Server Error while creating staff member',
    });
  }
};

/**
 * @desc    Delete a staff member
 * @route   DELETE /api/admins/:id
 * @access  Private (Admin only)
 */
export const deleteAdmin = async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id);

    if (!admin) {
      return res.status(404).json({ status: 'error', message: 'Staff member not found' });
    }

    if (admin._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ status: 'error', message: 'You cannot delete your own account' });
    }

    await Admin.deleteOne({ _id: admin._id });

    res.status(200).json({
      status: 'success',
      message: 'Staff member removed successfully',
    });
  } catch (error) {
    console.error(`\x1b[31m[Delete Admin Error] %s\x1b[0m`, error.stack);
    res.status(500).json({
      status: 'error',
      message: 'Server Error',
    });
  }
};
