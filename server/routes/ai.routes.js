const express = require('express');
const router = express.Router();
const { getInsights, queryInsights, querySchema } = require('../controllers/ai.controller');
const { protect } = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');

// GET /api/insights is requested to be mounted at the root by the prompt, 
// but to keep it organized it's often mounted as /api/ai/insights or /api/insights.
// The prompt asked to mount /api/insights and /api/ai/query.
// We'll export the router and mount it appropriately in index.js.

router.get('/insights', protect, getInsights);
router.post('/query', protect, validate(querySchema), queryInsights);

module.exports = router;
