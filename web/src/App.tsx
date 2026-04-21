import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { TrendingUp, LayoutDashboard, Search, Settings, BarChart3 } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import StockDetail from './pages/stock/StockDetail';
import StockChoose from './pages/stock/StockChoose';
import Screen from './pages/Screen';
import SettingsPage from './pages/settings/SettingsPage';
import StockSearchInput from './components/StockSearchInput';

function SearchBar() {
  const navigate = useNavigate();

  return (
    <StockSearchInput
      placeholder="输入代码、名称或拼音..."
      limit={8}
      inputClassName="w-64 px-3 py-2 text-sm"
      panelClassName="mt-1"
      onSelect={match => navigate(`/stock/${match.code}`)}
    />
  );
}

function NavLink({ to, children, icon: Icon }: { to: string; children: React.ReactNode; icon: any }) {
  const loc = useLocation();
  const active = loc.pathname === to || (to !== '/' && loc.pathname.startsWith(to));
  return (
    <Link to={to} className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
      active ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
    }`}>
      <Icon size={18} /> {children}
    </Link>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <nav className="w-56 bg-slate-900 border-r border-slate-800 p-4 flex flex-col gap-1 shrink-0">
        <Link to="/" className="flex items-center gap-2 px-2 mb-6">
          <TrendingUp className="text-blue-500" size={24} />
          <span className="text-lg font-bold text-white">TongStock</span>
        </Link>
        <NavLink to="/" icon={LayoutDashboard}>市场总览</NavLink>
        <NavLink to="/stock/choose" icon={BarChart3}>个股分析</NavLink>
        <NavLink to="/screen" icon={Search}>信号筛选</NavLink>
        <NavLink to="/settings" icon={Settings}>配置</NavLink>
        <div className="mt-auto pt-4 border-t border-slate-800">
          <SearchBar />
        </div>
      </nav>
      <main className="flex-1 p-6 overflow-auto bg-slate-950">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/stock/choose" element={<StockChoose />} />
          <Route path="/stock/:code" element={<StockDetail />} />
          <Route path="/stock/:code/:tab" element={<StockDetail />} />
          <Route path="/screen" element={<Screen />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
