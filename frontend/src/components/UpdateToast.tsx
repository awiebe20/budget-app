import { useEffect, useState } from 'react';

export default function UpdateToast() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api) return;
    api.onUpdateDownloaded(() => setVisible(true));
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-3 bg-gray-800 border border-gray-700 text-white text-sm px-4 py-3 rounded-lg shadow-lg">
      <span>A new update is ready.</span>
      <button
        onClick={() => (window as any).electronAPI.restartAndInstall()}
        className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1 rounded transition-colors"
      >
        Restart to install
      </button>
      <button
        onClick={() => setVisible(false)}
        className="text-gray-400 hover:text-white ml-1 transition-colors"
      >
        ✕
      </button>
    </div>
  );
}