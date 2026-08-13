import { Route, Routes } from 'react-router-dom';

import { AppShell } from '#/components/layout/AppShell';
import { ChatPage } from '#/pages/ChatPage';
import { SessionListPage } from '#/pages/SessionListPage';

export function App(): React.JSX.Element {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<SessionListPage />} />
        <Route path="/sessions/:sessionId" element={<ChatPage />} />
      </Routes>
    </AppShell>
  );
}
