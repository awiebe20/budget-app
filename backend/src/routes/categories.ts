import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();
const prisma = new PrismaClient();

router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const categories = await prisma.category.findMany({
    include: { children: true },
    where: { parentId: null },
    orderBy: { order: 'asc' },
  });
  res.json(categories);
}));

router.post('/reorder', asyncHandler(async (req: Request, res: Response) => {
  const { order }: { order: { id: number; order: number }[] } = req.body;
  await Promise.all(
    order.map((item) => prisma.category.update({ where: { id: item.id }, data: { order: item.order } }))
  );
  res.json({ success: true });
}));

router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { name, parentId, color, isIncome, isReimbursement, isEssential } = req.body;
  const maxOrder = await prisma.category.aggregate({ _max: { order: true } });
  const nextOrder = (maxOrder._max.order ?? -1) + 1;
  const category = await prisma.category.create({
    data: { name, parentId, color, isIncome, isReimbursement, isEssential, order: nextOrder },
  });
  res.json(category);
}));

router.patch('/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  const { name, color, isReimbursement, isEssential, paycheckTiming } = req.body;
  const category = await prisma.category.update({
    where: { id },
    data: {
      ...(name && { name }),
      ...(color && { color }),
      ...(isReimbursement !== undefined && { isReimbursement }),
      ...(isEssential !== undefined && { isEssential }),
      ...(paycheckTiming !== undefined && { paycheckTiming }),
    },
  });
  res.json(category);
}));

router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  await prisma.transaction.updateMany({ where: { categoryId: id }, data: { categoryId: null } });
  await prisma.budget.deleteMany({ where: { categoryId: id } });
  await prisma.category.delete({ where: { id } });
  res.json({ success: true });
}));

export default router;
