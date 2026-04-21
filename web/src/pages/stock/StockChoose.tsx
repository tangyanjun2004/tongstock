import { useNavigate } from 'react-router-dom';
import StockSearchInput from '../../components/StockSearchInput';

export default function StockChoose() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-0">
      <div className="w-full max-w-lg">
        <h1 className="text-2xl font-bold text-white mb-8 text-center">个股分析</h1>
        <StockSearchInput
          autoFocus
          limit={12}
          placeholder="输入股票代码、名称或拼音搜索..."
          inputClassName="px-4 py-4 text-lg"
          iconClassName="ml-4"
          panelClassName="max-h-96"
          onSelect={match => navigate(`/stock/${match.code}`)}
        />

        <div className="mt-8 text-center text-slate-500 text-sm">
          <p>支持股票代码、简称、拼音和首字母搜索</p>
          <p>当存在多个匹配项时，请先从候选列表中选择</p>
        </div>
      </div>
    </div>
  );
}
