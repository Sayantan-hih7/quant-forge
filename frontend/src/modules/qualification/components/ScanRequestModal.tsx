import '../../../styles/scan-jobs.css';
import { Alert, Button, Modal } from 'antd';
import type { RuleTemplate } from '../types';

export function ScanRequestModal({ open, onClose, onQueue, rules, scope, month, kind, disabled = false }: {
  open: boolean; onClose: () => void; onQueue: () => void; rules: RuleTemplate[];
  scope: number; month: string; kind: 'monthly' | 'trial' | 'tactical'; disabled?: boolean;
}) {
  return <Modal open={open} title={kind === 'tactical' ? 'Review signal scan' : kind === 'trial' ? 'Review trial scan' : 'Review monthly scan'} onCancel={onClose} width={560} footer={<><Button onClick={onClose}>Back</Button><Button type="primary" disabled={disabled} onClick={onQueue}>Queue scan</Button></>}>
    <div className="q-scan-request"><p>{kind === 'trial' ? 'Evaluate the selected preset against the full universe. Your published monthly candidates stay unchanged.' : kind === 'monthly' ? 'Run the saved base preset, review its candidates, then publish the monthly universe.' : 'Evaluate the saved trigger rules against the published monthly candidates. Previous signals stay visible until this job completes.'}</p>
      <dl><div><dt>Rules to run</dt><dd>{rules.map((rule) => <span key={rule.id}>{rule.name} · v{rule.revision}</span>)}</dd></div><div><dt>Scan scope</dt><dd>{scope.toLocaleString('en-IN')} {kind === 'tactical' ? 'cached candidates' : 'stocks · full universe'}</dd></div><div><dt>Cache month</dt><dd>{month}</dd></div><div><dt>After completion</dt><dd>{kind === 'trial' ? 'Review trial results' : kind === 'monthly' ? 'Review and publish candidates' : 'Update signals for the scanned rule versions'}</dd></div></dl>
      <Alert type="info" showIcon title="Queued processing" description="Data preparation, rule evaluation and result validation happen in separate stages. Saving or selecting a preset does not run this job." />
      <p className="q-request-note">UI simulation with accelerated progress. Real scan duration will depend on market-data availability and backend processing.</p>
    </div>
  </Modal>;
}
