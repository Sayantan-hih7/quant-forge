import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { dashboardPreferences, saveDashboardPreferences } from '../src/modules/dashboard/services/preferences.service.js';
import { DashboardPreferencesModel } from '../src/modules/dashboard/models/preferences.model.js';
import { dashboardPreferencesSchema, defaultDashboardPreferences } from '../src/modules/dashboard/validations/preferences.validation.js';

test('dashboard preferences reject unknown indices, duplicate sections and unbounded activity requests', () => {
  for (const patch of [
    { indexIds: ['unknown:index'] }, { indexIds: [] }, { indexIds: ['nse:nifty-100', 'nse:nifty-100'] },
    { sections: defaultDashboardPreferences.sections.map(() => ({ id: 'market', visible: true })) },
    { sections: defaultDashboardPreferences.sections.map(s => ({ ...s, visible: false })) },
    { signalCount: 100000 }, { metricIds: [] }, { feedEnabled: false },
  ]) assert.equal(dashboardPreferencesSchema.safeParse({ ...defaultDashboardPreferences, ...patch }).success, false);
  assert.equal(dashboardPreferencesSchema.safeParse({ ...defaultDashboardPreferences, indexIds: ['nse:nifty-100', 'bse:bse-sensex'], signalSide: 'SELL' }).success, true);
});

test('saved dashboard preferences survive reload, detect stale editors and allow an explicit restore to defaults', { skip: process.env.RUN_DB_TESTS !== '1' }, async () => {
  const name = `quantforge_test_${randomUUID().replaceAll('-', '')}`, uri = new URL(env.MONGODB_URI); uri.pathname = `/${name}`;
  try {
    await mongoose.connect(uri.toString());
    const initial = await dashboardPreferences();
    assert.equal(initial.revision, 0); assert.deepEqual(initial.settings, defaultDashboardPreferences);
    initial.settings.indexIds.push('nse:nifty-100');
    assert.deepEqual((await dashboardPreferences()).settings, defaultDashboardPreferences, 'Defaults are not mutable shared state');
    const custom = { ...structuredClone(defaultDashboardPreferences), indexIds: ['nse:nifty-100', 'bse:bse-sensex'], density: 'compact' as const, signalSide: 'SELL' as const, signalCount: 20 as const };
    custom.sections = [custom.sections[1], custom.sections[0], ...custom.sections.slice(2)].map(section => ({ ...section, visible: section.id !== 'backtests' }));
    const saved = await saveDashboardPreferences({ revision: 0, settings: custom });
    assert.equal(saved.revision, 1); assert.deepEqual(saved.settings, custom);
    assert.deepEqual((await dashboardPreferences()).settings, custom);
    await assert.rejects(saveDashboardPreferences({ revision: 0, settings: defaultDashboardPreferences }), /changed in another window/);
    const simultaneous = await Promise.allSettled([
      saveDashboardPreferences({ revision: 1, settings: custom }), saveDashboardPreferences({ revision: 1, settings: defaultDashboardPreferences }),
    ]);
    assert.equal(simultaneous.filter(r => r.status === 'fulfilled').length, 1);
    const restored = await saveDashboardPreferences({ revision: 2, settings: defaultDashboardPreferences });
    assert.equal(restored.revision, 3); assert.deepEqual(restored.settings, defaultDashboardPreferences);
    await DashboardPreferencesModel.updateOne({ _id: 'workspace' }, { $set: { settings: { ...custom, watchlistMode: 'selected', watchlistIds: ['old-list'] } } });
    assert.deepEqual((await dashboardPreferences()).settings, custom, 'Legacy list settings do not reset other preferences');
    await DashboardPreferencesModel.updateOne({ _id: 'workspace' }, { $set: { settings: { unsupported: true } } });
    const repaired = await dashboardPreferences();
    assert.equal(repaired.revision, 3); assert.ok(repaired.warning); assert.deepEqual(repaired.settings, defaultDashboardPreferences);
    await saveDashboardPreferences({ revision: 3, settings: defaultDashboardPreferences });
    assert.equal((await dashboardPreferences()).warning, undefined);
  } finally {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === name && /^quantforge_test_[a-f0-9]{32}$/.test(name)) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
