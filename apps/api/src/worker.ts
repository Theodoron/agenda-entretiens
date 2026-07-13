import 'reflect-metadata';
import { Prisma, PrismaClient } from '@prisma/client';
import { Queue, Worker } from 'bullmq';
import nodemailer from 'nodemailer';

const prisma = new PrismaClient();
const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
const connection = { host: redisUrl.hostname, port: Number(redisUrl.port || 6379), ...(redisUrl.password ? { password: redisUrl.password } : {}) };
const queue = new Queue('notifications', { connection });
const mailer = nodemailer.createTransport({ host: process.env.SMTP_HOST ?? 'localhost', port: Number(process.env.SMTP_PORT ?? 1025), secure: false });

async function recipients(payload: Record<string, unknown>) {
  const ids = [payload.studentId, payload.advisorId, payload.authorId].filter((value): value is string => typeof value === 'string');
  if (typeof payload.appointmentId === 'string') {
    const item = await prisma.appointment.findUnique({ where: { id: payload.appointmentId }, select: { studentId: true, advisorId: true } });
    if (item) ids.push(item.studentId, item.advisorId);
  }
  return [...new Set(ids)];
}

new Worker('notifications', async job => {
  const event = await prisma.outboxEvent.findUnique({ where: { id: job.data.eventId } });
  if (!event || event.processedAt) return;
  const payload = event.payload as Record<string, unknown>;
  const notificationPayload = event.payload as Prisma.InputJsonValue;
  for (const userId of await recipients(payload)) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, firstName: true } });
    if (!user) continue;
    const key = `${event.id}:${userId}`;
    await prisma.notification.upsert({ where: { deduplicationKey: `${key}:in-app` }, update: {}, create: { userId, channel: 'IN_APP', type: event.type, payload: notificationPayload, scheduledAt: new Date(), deduplicationKey: `${key}:in-app` } });
    const email = await prisma.notification.upsert({ where: { deduplicationKey: `${key}:email` }, update: {}, create: { userId, channel: 'EMAIL', type: event.type, payload: notificationPayload, scheduledAt: new Date(), deduplicationKey: `${key}:email` } });
    if (email.status === 'PENDING' || email.status === 'FAILED') {
      try { await mailer.sendMail({ from: process.env.MAIL_FROM, to: user.email, subject: 'Mise à jour de votre rendez-vous', text: `Bonjour ${user.firstName}, une mise à jour est disponible dans votre espace CIDO (${event.type}).` }); await prisma.notification.update({ where: { id: email.id }, data: { status: 'SENT', sentAt: new Date() } }); }
      catch { await prisma.notification.update({ where: { id: email.id }, data: { status: 'FAILED' } }); throw new Error('Échec de l’envoi SMTP'); }
    }
  }
  await prisma.outboxEvent.update({ where: { id: event.id }, data: { processedAt: new Date(), attempts: { increment: 1 } } });
}, { connection });

async function pump() {
  const events = await prisma.outboxEvent.findMany({ where: { processedAt: null }, orderBy: { occurredAt: 'asc' }, take: 100 });
  for (const event of events) await queue.add('outbox', { eventId: event.id }, { jobId: event.id, attempts: 5, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: 1000 });
}
setInterval(() => void pump(), 5000);
void pump();
