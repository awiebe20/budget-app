import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.get('/', async (_req: Request, res: Response) => {
  const categories = await prisma.category.findMany({
    include: { children: true },
    where: { parentId: null },
  });
  res.json(categories);
});

router.post('/', async (req: Request, res: Response) => {
  const { name, parentId, color, isIncome } = req.body;
  const category = await prisma.category.create({
    data: { name, parentId, color, isIncome },
  });
  res.json(category);
});

router.patch('/:id', async (req: Request, res: Response) => {
  const { name, color } = req.body;
  const category = await prisma.category.update({
    where: { id: parseInt(req.params.id) },
    data: { ...(name && { name }), ...(color && { color }) },
  });
  res.json(category);
});

router.delete('/:id', async (req: Request, res: Response) => {
  await prisma.category.delete({ where: { id: parseInt(req.params.id) } });
  res.json({ success: true });
});

export default router;
