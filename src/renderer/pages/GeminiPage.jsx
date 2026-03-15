import React, { useEffect, useState } from 'react';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Label from '../components/ui/Label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';

export default function GeminiPage() {
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gemini-2.0-flash');
  const [prompt, setPrompt] = useState('');
  const [imagePath, setImagePath] = useState('');
  const [imageName, setImageName] = useState('');
  const [loading, setLoading] = useState(false);
  const [resultText, setResultText] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    const loadKey = async () => {
      const key = await window.vyapar.getGeminiApiKey();
      if (mounted) setApiKey(key || '');
    };
    loadKey();
    return () => {
      mounted = false;
    };
  }, []);

  const saveApiKey = async () => {
    await window.vyapar.setGeminiApiKey(apiKey);
  };

  const runRequest = async () => {
    setLoading(true);
    setError('');
    setResultText('');
    try {
      await saveApiKey();
      const response = await window.vyapar.generateGemini({
        prompt,
        imagePath: imagePath || '',
        model
      });
      setResultText(String(response?.text || ''));
    } catch (err) {
      setError(err?.message || 'Gemini request failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="section-title text-3xl font-semibold">Gemini API</h2>
        <p className="text-muted">Send prompt + optional image through app backend to Gemini SDK.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Request</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Gemini API Key</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="AIza..."
            />
          </div>

          <div>
            <Label>Model</Label>
            <Input
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="gemini-2.0-flash"
            />
          </div>

          <div>
            <Label>Image (optional)</Label>
            <Input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  setImagePath('');
                  setImageName('');
                  return;
                }
                setImagePath(file.path || '');
                setImageName(file.name || '');
              }}
            />
            {imageName ? <p className="mt-1 text-xs text-muted">Selected: {imageName}</p> : null}
          </div>

          <div>
            <Label>Prompt</Label>
            <textarea
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accentSoft"
              rows={8}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe what to extract from this image..."
            />
          </div>

          <div className="flex items-center gap-3">
            <Button type="button" onClick={runRequest} disabled={loading || !prompt.trim()}>
              {loading ? 'Sending...' : 'Send to Gemini'}
            </Button>
            <Button type="button" variant="outline" onClick={saveApiKey}>
              Save API Key
            </Button>
          </div>

          {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Gemini Response</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-[460px] overflow-auto rounded-lg border border-border bg-muted/20 p-3 text-xs">
            {resultText || 'No response yet.'}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
