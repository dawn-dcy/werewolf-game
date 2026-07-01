import React, { useState, useEffect } from 'react';
import { Settings, Key, Globe, Cpu, X, Save, AlertCircle, CheckCircle2, Brain } from 'lucide-react';
import { AIConfig, loadAIConfig, saveAIConfig } from '../services/aiService';

interface AISettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

const AISettings: React.FC<AISettingsProps> = ({ isOpen, onClose }) => {
  const [config, setConfig] = useState<AIConfig>(loadAIConfig());
  const [saved, setSaved] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');

  useEffect(() => {
    if (isOpen) {
      setConfig(loadAIConfig());
      setSaved(false);
      setTestStatus('idle');
    }
  }, [isOpen]);

  const handleSave = () => {
    saveAIConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  /**
   * 规范化 API URL：如果用户只填了 base URL，自动补全 /v1/chat/completions
   */
  const normalizeApiUrl = (url: string): string => {
    let trimmed = url.trim().replace(/\/+$/, '');
    // 如果已经是完整的 chat/completions 端点，直接返回
    if (trimmed.endsWith('/chat/completions')) return trimmed;
    // 如果以 /v1 结尾，补全 /chat/completions
    if (trimmed.endsWith('/v1')) return trimmed + '/chat/completions';
    // 如果看起来像 base URL（不以 chat/completions 结尾），补全路径
    if (!trimmed.includes('/chat/completions')) {
      // 检查是否已经包含 /v1
      if (trimmed.includes('/v1/')) {
        return trimmed.replace(/\/v1\/.*$/, '') + '/v1/chat/completions';
      }
      return trimmed + '/v1/chat/completions';
    }
    return trimmed;
  };

  const handleTest = async () => {
    if (!config.apiKey.trim()) {
      setTestStatus('error');
      setTestMessage('请先填写 API 密钥');
      return;
    }

    if (!config.apiUrl.trim()) {
      setTestStatus('error');
      setTestMessage('请先填写 API 地址');
      return;
    }

    setTestStatus('testing');
    setTestMessage('正在测试连接...');

    const testUrl = normalizeApiUrl(config.apiUrl);

    try {
      const response = await fetch(testUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: '请回复"连接成功"四个字。' }],
          max_tokens: 1024,
          temperature: 0,
          extra_body: { enable_thinking: config.thinking },
          chat_template_kwargs: { enable_thinking: config.thinking },
          enable_thinking: config.thinking,
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorData}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      if (content) {
        setTestStatus('success');
        setTestMessage(`连接成功！模型回复：${content}`);
      } else {
        setTestStatus('error');
        const raw = JSON.stringify(data).substring(0, 300);
        setTestMessage(`API 返回了空内容，请检查模型名称。原始响应: ${raw}`);
      }
    } catch (err: any) {
      setTestStatus('error');
      setTestMessage(`连接失败：${err.message}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-primary-900 border border-primary-700/50 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col animate-fade-in shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-primary-800/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent-500/20 flex items-center justify-center">
              <Settings className="w-5 h-5 text-accent-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-primary-200">大模型 API 设置</h2>
              <p className="text-xs text-primary-500">配置 AI 大模型接口，让对手更加智能</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-primary-800 text-primary-500 hover:text-primary-300 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* API URL */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-primary-300 mb-1.5">
              <Globe className="w-4 h-4 text-accent-400" />
              API 地址
            </label>
            <input
              type="text"
              value={config.apiUrl}
              onChange={(e) => setConfig({ ...config, apiUrl: e.target.value })}
              placeholder="https://api.deepseek.com"
              className="w-full bg-primary-800/60 border border-primary-700/50 rounded-xl px-4 py-2.5 text-primary-200 text-sm placeholder-primary-600 focus:outline-none focus:border-accent-500/50 focus:ring-1 focus:ring-accent-500/30 transition-all"
            />
            <p className="text-[10px] text-primary-600 mt-1">
              支持 OpenAI 兼容接口。可直接填 Base URL（如 https://api.deepseek.com），系统会自动补全 /v1/chat/completions 路径
            </p>
          </div>

          {/* API Key */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-primary-300 mb-1.5">
              <Key className="w-4 h-4 text-accent-400" />
              API 密钥
            </label>
            <input
              type="password"
              value={config.apiKey}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
              placeholder="sk-xxxxxxxxxxxxxxxx"
              className="w-full bg-primary-800/60 border border-primary-700/50 rounded-xl px-4 py-2.5 text-primary-200 text-sm placeholder-primary-600 focus:outline-none focus:border-accent-500/50 focus:ring-1 focus:ring-accent-500/30 transition-all font-mono"
            />
          </div>

          {/* Model */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-primary-300 mb-1.5">
              <Cpu className="w-4 h-4 text-accent-400" />
              模型名称
            </label>
            <input
              type="text"
              value={config.model}
              onChange={(e) => setConfig({ ...config, model: e.target.value })}
              placeholder="deepseek-v4-flash / gpt-4o / qwen3.7-plus"
              className="w-full bg-primary-800/60 border border-primary-700/50 rounded-xl px-4 py-2.5 text-primary-200 text-sm placeholder-primary-600 focus:outline-none focus:border-accent-500/50 focus:ring-1 focus:ring-accent-500/30 transition-all"
            />
          </div>

          {/* Advanced settings */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-primary-400 mb-1 block">
                最大 Token 数
              </label>
              <input
                type="number"
                value={config.maxTokens}
                onChange={(e) => setConfig({ ...config, maxTokens: parseInt(e.target.value) || 8192 })}
                min={1}
                max={32768}
                className="w-full bg-primary-800/60 border border-primary-700/50 rounded-xl px-3 py-2 text-primary-200 text-sm focus:outline-none focus:border-accent-500/50 transition-all"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-primary-400 mb-1 block">
                温度 (0-2)
              </label>
              <input
                type="number"
                value={config.temperature}
                onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) || 1 })}
                min={0}
                max={2}
                step={0.1}
                className="w-full bg-primary-800/60 border border-primary-700/50 rounded-xl px-3 py-2 text-primary-200 text-sm focus:outline-none focus:border-accent-500/50 transition-all"
              />
            </div>
          </div>

          {/* Thinking mode toggle */}
          <div className="flex items-center justify-between bg-primary-800/30 border border-primary-700/30 rounded-xl px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <Brain className="w-4 h-4 text-purple-400" />
              </div>
              <div>
                <div className="text-sm font-medium text-primary-200">思考模式</div>
                <div className="text-[10px] text-primary-500">兼容 extra_body / chat_template_kwargs / enable_thinking 三种配置方式</div>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.thinking}
                onChange={(e) => setConfig({ ...config, thinking: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-primary-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:bg-purple-500 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-primary-300 after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
            </label>
          </div>

          {/* Test result */}
          {testStatus !== 'idle' && (
            <div className={`p-3 rounded-xl text-sm ${
              testStatus === 'testing'
                ? 'bg-primary-800/40 border border-primary-700/30 text-primary-400'
                : testStatus === 'success'
                ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                : 'bg-blood-500/10 border border-blood-500/30 text-blood-400'
            }`}>
              <div className="flex items-center gap-2">
                {testStatus === 'testing' && <div className="w-4 h-4 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />}
                {testStatus === 'success' && <CheckCircle2 className="w-4 h-4 text-green-400" />}
                {testStatus === 'error' && <AlertCircle className="w-4 h-4 text-blood-400" />}
                <span>{testMessage}</span>
              </div>
            </div>
          )}

          {/* Tips */}
          <div className="bg-primary-800/30 border border-primary-700/30 rounded-xl p-3">
            <h4 className="text-xs font-bold text-primary-400 mb-1">💡 配置说明</h4>
            <ul className="text-[10px] text-primary-500 space-y-1">
              <li>• 默认使用 DeepSeek deepseek-v4-flash，已开启思考模式</li>
              <li>• DeepSeek: 填 https://api.deepseek.com，模型填 deepseek-v4-flash</li>
              <li>• OpenAI: 填 https://api.openai.com，模型填 gpt-4o</li>
              <li>• 通义千问: 填 https://dashscope.aliyuncs.com/compatible-mode/v1</li>
              <li>• 智谱 GLM: 填 https://open.bigmodel.cn/api/paas/v4/chat/completions</li>
              <li>• 未配置 API 时将使用本地策略作为后备方案</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-primary-800/50 shrink-0">
          <button
            onClick={handleTest}
            disabled={testStatus === 'testing' || !config.apiKey.trim()}
            className="px-4 py-2 bg-primary-700 hover:bg-primary-600 disabled:bg-primary-800 disabled:text-primary-600 text-primary-300 rounded-xl text-sm cursor-pointer transition-all flex items-center gap-2"
          >
            {testStatus === 'testing' ? (
              <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <AlertCircle className="w-4 h-4" />
            )}
            测试连接
          </button>

          <div className="flex items-center gap-3">
            {saved && (
              <span className="text-xs text-green-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                已保存
              </span>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 bg-primary-800 hover:bg-primary-700 text-primary-400 rounded-xl text-sm cursor-pointer transition-all"
            >
              关闭
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 bg-accent-600 hover:bg-accent-500 text-primary-950 font-bold rounded-xl text-sm cursor-pointer transition-all flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              保存配置
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AISetting