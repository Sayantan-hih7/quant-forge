import mongoose, { Schema } from 'mongoose';

// One-time local migration for this project only. Neither database is dropped or truncated.
const sourceUri = 'mongodb://127.0.0.1:27017/quantforge_paper';
const targetUri = 'mongodb://127.0.0.1:27019/quantforge_paper?replicaSet=quantforge&directConnection=true';
const source = await mongoose.createConnection(sourceUri).asPromise();
const destination = await mongoose.createConnection(targetUri).asPromise();
if (source.name !== 'quantforge_paper' || destination.name !== 'quantforge_paper') throw new Error('Unexpected database name');
try {
  const names = (await source.db!.listCollections({}, { nameOnly: true }).toArray()).map(x => x.name).filter(x => !x.startsWith('system.'));
  for (const name of names) {
    const definition = new Schema({ _id: Schema.Types.Mixed }, { strict: false, versionKey: false, autoIndex: false });
    const from = source.model(name, definition, name), to = destination.model(name, definition, name);
    let batch: Record<string, unknown>[] = [], count = 0;
    const flush = async () => {
      if (!batch.length) return;
      await to.bulkWrite(batch.map(document => ({ replaceOne: { filter: { _id: document._id }, replacement: document, upsert: true } })));
      count += batch.length; batch = [];
    };
    for await (const row of from.find().lean().cursor()) { batch.push(row); if (batch.length === 500) await flush(); }
    await flush();
    const targetCount = await to.countDocuments();
    if (targetCount !== count) throw new Error(`Count mismatch for ${name}`);
    console.log(`${name}: ${count} records copied and counted`);
  }
} finally { await source.close(); await destination.close(); }
