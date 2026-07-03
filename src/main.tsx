import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

// 阻止外部脚本/扩展的无关错误污染控制台
const shouldSuppressError = (msg: unknown, error?: Error | null): boolean => {
  const msgStr = String(msg || '');
  return (
    msgStr.includes('getBoundingClientRect') ||
    msgStr === 'Script error.' ||
    msgStr.includes('[unknown-error]') ||
    (!!error && String(error.message || '').includes('getBoundingClientRect'))
  );
};

// useCapture: true 在捕获阶段就拦截，优先于 webview 诊断
window.addEventListener('error', (event) => {
  if (shouldSuppressError(event.message, event.error)) {
    event.stopImmediatePropagation();
    event.preventDefault();
  }
}, true);

window.onerror = (msg, source, lineno, colno, error) => {
  if (shouldSuppressError(msg, error)) {
    return true;
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
