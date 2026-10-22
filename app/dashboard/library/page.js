import { requireStaffPage } from '../../../lib/access';
import { listTracks, listVoices, listPlaylists, DEFAULT_VOICE_TAGS } from '../../../lib/library';
import LibraryClient from '../../../components/LibraryClient';
import PageHeader from '../../../components/PageHeader';
import DashboardSidebar, { DASHBOARD_SHELL_STYLES } from '../../../components/DashboardSidebar';

// Real, editable data — never statically cache this page.
export const dynamic = 'force-dynamic';

export default async function LibraryPage() {
  await requireStaffPage();
  const [tracks, voices, playlists] = await Promise.all([listTracks(), listVoices(), listPlaylists()]);

  return (
    <div style={{ minHeight: '100vh', background: '#DEDCD7', display: 'flex' }} className="tfa-dash-shell">
      <DashboardSidebar active="library" />

      <main style={{ flex: 1, padding: '32px 36px', minWidth: 0 }} className="tfa-dash-main">
        <PageHeader title="Bibliotheek">De muziek en stemmen waaruit klanten kiezen. Wat je hier toevoegt of aanpast, zien klanten meteen in hun formulier.</PageHeader>
        <LibraryClient tracks={tracks} voices={voices} playlists={playlists} defaultTags={DEFAULT_VOICE_TAGS} />
      </main>

      <style>{DASHBOARD_SHELL_STYLES}</style>
    </div>
  );
}
