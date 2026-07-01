import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

// 阻止外部脚本/扩展的无关错误污染控制台
const _prevOnerror = window.onerror;
window.onerror = (msg, source, lineno, colno, error) => {
  const msgStr = String(msg || '');
  if (
    msgStr.includes('getBoundingClientRect') ||
    msgStr === 'Script error.' ||
    (error && error.message?.includes('getBoundingClientRect'))
  ) {
    return true; // 返回 true 阻止浏览器默认的错误日志
  }
  if (_prevOnerror) {
    return _prevOnerror(msg, source, lineno, colno, error);
  }
  return false;
};

const rootEl = document.getElementById('root');
if (!rootEl) {
  document.body.innerHTML = '<div style="text-align:center;padding:40px;color:white;background:#1c1917;min-height:100vh"><h2>加载失败</h2><p>找不到根节点 #root，请刷新重试。</p></div>';
} else {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  );
}
