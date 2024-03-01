import { Router } from 'express';

import { quoteController, testController } from './controllers';


const router = Router();

router.get('/api/test', testController);
router.post('/api/quote', quoteController);

export default router;
