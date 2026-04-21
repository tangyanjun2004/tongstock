import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '../api/client';
import type { SearchStockMatch } from '../types/api';

interface StockSearchInputProps {
  initialQuery?: string;
  placeholder?: string;
  limit?: number;
  autoFocus?: boolean;
  panelClassName?: string;
  inputClassName?: string;
  containerClassName?: string;
  iconClassName?: string;
  showIcon?: boolean;
  emptyText?: string;
  onSelect: (match: SearchStockMatch) => void;
}

export default function StockSearchInput({
  initialQuery = '',
  placeholder = '输入股票代码、名称或拼音',
  limit = 10,
  autoFocus = false,
  panelClassName = '',
  inputClassName = '',
  containerClassName = '',
  iconClassName = '',
  showIcon = true,
  emptyText,
  onSelect,
}: StockSearchInputProps) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchStockMatch[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const requestSeq = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setHighlightedIndex(-1);
      }
    };

    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setMessage(null);
      setLoading(false);
      setHighlightedIndex(-1);
      return;
    }

    const seq = ++requestSeq.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await api.searchStocks(trimmed, limit);
        if (requestSeq.current !== seq) return;

        setResults(response.matches);
        setHighlightedIndex(response.matches.length > 0 ? 0 : -1);
        if (response.matches.length === 0) {
          setMessage(emptyText ?? `未找到股票 “${trimmed}”`);
        } else if (!response.resolved && response.matches.length > 1) {
          setMessage(`找到 ${response.total} 个匹配项，请选择具体个股`);
        } else {
          setMessage(null);
        }
      } catch {
        if (requestSeq.current !== seq) return;
        setResults([]);
        setHighlightedIndex(-1);
        setMessage('搜索失败，请稍后重试');
      } finally {
        if (requestSeq.current === seq) {
          setLoading(false);
        }
      }
    }, 150);

    return () => window.clearTimeout(timer);
  }, [emptyText, limit, query]);

  const hasPanel = open && (!!query.trim() || loading) && (results.length > 0 || !!message || loading);

  const activeOptionId = useMemo(() => {
    if (highlightedIndex < 0 || highlightedIndex >= results.length) return undefined;
    return `${listboxId}-${results[highlightedIndex].code}`;
  }, [highlightedIndex, listboxId, results]);

  const selectMatch = (match: SearchStockMatch) => {
    setQuery(match.name);
    setOpen(false);
    setMessage(null);
    onSelect(match);
  };

  const handleEnter = () => {
    if (highlightedIndex >= 0 && results[highlightedIndex]) {
      selectMatch(results[highlightedIndex]);
      return;
    }

    if (results.length === 1) {
      selectMatch(results[0]);
      return;
    }

    if (results.length > 1) {
      setOpen(true);
      setMessage(`找到 ${results.length} 个匹配项，请先选择具体个股`);
      return;
    }

    if (query.trim()) {
      setOpen(true);
      setMessage(emptyText ?? `未找到股票 “${query.trim()}”`);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${containerClassName}`}>
      <div className="flex items-center bg-slate-800 rounded-lg border border-slate-700 focus-within:border-blue-500 transition-colors">
        {showIcon && <Search size={18} className={`ml-3 shrink-0 text-slate-500 ${iconClassName}`} />}
        <input
          type="text"
          value={query}
          autoFocus={autoFocus}
          role="combobox"
          aria-expanded={hasPanel}
          aria-controls={listboxId}
          aria-activedescendant={activeOptionId}
          aria-autocomplete="list"
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={event => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={event => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              setHighlightedIndex(prev => (results.length === 0 ? -1 : Math.min(prev + 1, results.length - 1)));
              return;
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setOpen(true);
              setHighlightedIndex(prev => (results.length === 0 ? -1 : Math.max(prev - 1, 0)));
              return;
            }
            if (event.key === 'Escape') {
              setOpen(false);
              setHighlightedIndex(-1);
              return;
            }
            if (event.key === 'Enter') {
              event.preventDefault();
              handleEnter();
            }
          }}
          className={`flex-1 bg-transparent text-white focus:outline-none ${showIcon ? '' : 'px-4'} ${inputClassName}`}
        />
      </div>

      {hasPanel && (
        <div
          id={listboxId}
          role="listbox"
          className={`absolute top-full mt-2 w-full overflow-hidden rounded-lg border border-slate-700 bg-slate-800 shadow-xl z-50 ${panelClassName}`}
        >
          {loading && <div className="px-4 py-3 text-sm text-slate-400">搜索中...</div>}

          {!loading && results.length > 0 && (
            <div className="max-h-80 overflow-auto py-1">
              {results.map((match, index) => {
                const active = index === highlightedIndex;
                return (
                  <button
                    key={match.code}
                    id={`${listboxId}-${match.code}`}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => selectMatch(match)}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${active ? 'bg-slate-700' : 'hover:bg-slate-700/70'}`}
                  >
                    <div className="min-w-0">
                      <div className="text-white font-medium truncate">{match.name}</div>
                      <div className="text-xs text-slate-400 truncate">{match.exchange} · {labelForMatchType(match.matchType)}</div>
                    </div>
                    <span className="font-mono text-sm text-blue-400 shrink-0">{match.code}</span>
                  </button>
                );
              })}
            </div>
          )}

          {!loading && message && (
            <div className="border-t border-slate-700/60 px-4 py-3 text-sm text-slate-400">{message}</div>
          )}
        </div>
      )}
    </div>
  );
}

function labelForMatchType(matchType: string): string {
  switch (matchType) {
    case 'exact_code':
      return '代码精确匹配';
    case 'exact_name':
      return '名称精确匹配';
    case 'exact_pinyin':
      return '拼音精确匹配';
    case 'exact_initials':
      return '字母精确匹配';
    case 'prefix_code':
      return '代码前缀匹配';
    case 'prefix_name':
      return '名称前缀匹配';
    case 'prefix_pinyin':
      return '拼音前缀匹配';
    case 'prefix_initials':
      return '字母前缀匹配';
    case 'contains_code':
      return '代码包含匹配';
    case 'contains_name':
      return '名称包含匹配';
    case 'contains_pinyin':
      return '拼音包含匹配';
    case 'contains_initials':
      return '字母包含匹配';
    default:
      return '匹配结果';
  }
}
