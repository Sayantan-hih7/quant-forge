import { dashboardSectionOptions, metricOptions, type DashboardPreferences } from '../../dashboard/config/preferences';
import { indexCatalog } from '../../market-data/config/indices';
export function DashboardLayoutPreview({ settings }: { settings: DashboardPreferences }) {
  const label = (id: string) => indexCatalog.find(index => index.id === id)?.name ?? id;
  return <aside className={`dashboard-layout-preview is-${settings.density}`} aria-label="Dashboard layout preview"><h3>Your dashboard</h3><p>Preview your layout. Save to apply these choices.</p>
    {settings.sections.filter(section => section.visible).map(section => <div key={section.id} data-section={section.id} className={`dashboard-preview-widget dashboard-preview-${section.id}`}>
      <strong>{dashboardSectionOptions.find(option => option.id === section.id)?.label}</strong>
      {section.id === 'market' ? <div className="dashboard-preview-cards">{settings.indexIds.map(id => <span key={id}>{label(id)}</span>)}</div> : section.id === 'summary' ? <div className="dashboard-preview-cards">{settings.metricIds.map(id => <span key={id}>{metricOptions.find(option => option.value === id)?.label}</span>)}</div> : <span className="dashboard-preview-placeholder" />}
    </div>)}
    <p>Feed problems and order-confirmation alerts always stay visible.</p>
  </aside>;
}
