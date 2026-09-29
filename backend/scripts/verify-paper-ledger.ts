import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../src/shared/database.js';
import { PaperOrderModel, PaperPositionModel, PaperSessionModel } from '../src/modules/paper-trading/models/paper.model.js';

// A consistent database snapshot: live fills can continue while this audit runs.
await connectDatabase();
try {
  const accounts: unknown[] = [], issues: string[] = [];
  await mongoose.connection.transaction(async transaction => {
    const sessions = await PaperSessionModel.find().session(transaction).lean();
    const positions = await PaperPositionModel.find().session(transaction).lean();
    const orders = await PaperOrderModel.find({ status: 'filled' }).sort({ filledAt: 1, _id: 1 }).session(transaction).lean();
    for (const session of sessions) {
      const fills = orders.filter(o => o.sessionId === session._id);
      const held = positions.filter(p => p.sessionId === session._id);
      let expectedCash = session.initialPaise;
      const shares = new Map<string, number>();
      for (const order of fills) {
        if (!order.fillPaise || order.feePaise == null || order.quantity <= 0) { issues.push(`${order._id}: invalid fill amount`); continue; }
        const signed = order.side === 'BUY' ? order.quantity : -order.quantity;
        shares.set(order.instrumentId, (shares.get(order.instrumentId) ?? 0) + signed);
        expectedCash -= signed * order.fillPaise + order.feePaise;
        if (shares.get(order.instrumentId)! < 0) issues.push(`${order._id}: sold more shares than held`);
        if (!order.quoteAt || order.quoteAt <= order.eligibleAfter || !order.filledAt || Date.parse(order.filledAt) - Date.parse(order.quoteAt) > 15_000) issues.push(`${order._id}: fill did not use a subsequent fresh quote`);
      }
      const shareDifferences = [...new Set([...shares.keys(), ...held.map(p => p.instrumentId)])].filter(id => (shares.get(id) ?? 0) !== (held.find(p => p.instrumentId === id)?.quantity ?? 0));
      if (expectedCash !== session.cashPaise || shareDifferences.length) issues.push(`${session._id}: cash or position ledger differs from filled orders`);
      accounts.push({ id: session._id, strategy: session.strategy.name, active: session.active, fills: fills.length, initialPaise: session.initialPaise,
        expectedCashPaise: expectedCash, actualCashPaise: session.cashPaise, openPositions: held.length, shareDifferences,
        orders: fills.map(o => ({ id: o._id, instrumentId: o.instrumentId, side: o.side, quantity: o.quantity, source: o.source, reason: o.reason, pricePaise: o.fillPaise, feePaise: o.feePaise, filledAt: o.filledAt, quoteAt: o.quoteAt })) });
    }
  }, { readConcern: { level: 'snapshot' } });
  const report = { at: new Date().toISOString(), passed: issues.length === 0, issues, accounts };
  if (process.env.LEDGER_OUTPUT) await writeFile(resolve(process.env.LEDGER_OUTPUT), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (issues.length) process.exitCode = 1;
} finally { await disconnectDatabase(); }
