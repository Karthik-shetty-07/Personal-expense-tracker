const express = require('express');
const router = express.Router();
const { getTransactions, addTransaction, deleteTransaction, transactionSchema } = require('../controllers/transaction.controller');
const { protect } = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');

router.route('/')
  .get(protect, getTransactions)
  .post(protect, validate(transactionSchema), addTransaction);

router.route('/:id')
  .delete(protect, deleteTransaction);

module.exports = router;
