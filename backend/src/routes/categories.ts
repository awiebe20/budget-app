import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.get('/', async (_req: Request, res: Response) => {
  const categories = await prisma.category.findMany({
    include: { children: true },
    where: { parentId: null },
    orderBy: { order: 'asc' },
  });
  res.json(categories);
});

router.post('/reorder', async (req: Request, res: Response) => {
  try {
    const { order }: { order: { id: number; order: number }[] } = req.body;
    await Promise.all(
      order.map((item) => prisma.category.update({ where: { id: item.id }, data: { order: item.order } }))
    );
    res.json({ success: true });
  } catch (err) {
    console.error('reorder error', err);
    res.status(500).json({ error: 'Failed to reorder categories' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const { name, parentId, color, isIncome, isReimbursement, isEssential } = req.body;
  const category = await prisma.category.create({
    data: { name, parentId, color, isIncome, isReimbursement, isEssential },
  });
  res.json(category);
});

router.patch('/:id', async (req: Request, res: Response) => {
  const { name, color, isReimbursement, isEssential, paycheckTiming } = req.body;
  const category = await prisma.category.update({
    where: { id: parseInt(req.params.id) },
    data: {
      ...(name && { name }),
      ...(color && { color }),
      ...(isReimbursement !== undefined && { isReimbursement }),
      ...(isEssential !== undefined && { isEssential }),
      ...(paycheckTiming !== undefined && { paycheckTiming }),
    },
  });
  res.json(category);
});

router.delete('/:id', async (req: Request, res: Response) => {
  await prisma.category.delete({ where: { id: parseInt(req.params.id) } });
  res.json({ success: true });
});

export default router;
