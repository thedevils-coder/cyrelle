import { createElement, useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';
import WebView from 'react-native-webview';

type TokenWindow = Window & { __cyrelleResolveToken?: (token: string) => void };

export function SumsubFrame({ html, refreshToken, onMessage }: { html: string; refreshToken?: string | null; onMessage: (type: string) => void }) {
  const webview = useRef<WebView>(null);
  const iframe = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (!refreshToken) return;
    webview.current?.injectJavaScript(`window.__cyrelleResolveToken && window.__cyrelleResolveToken(${JSON.stringify(refreshToken)}); true;`);
    iframe.current?.contentWindow && (iframe.current.contentWindow as TokenWindow).__cyrelleResolveToken?.(refreshToken);
  }, [refreshToken]);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    function listener(event: MessageEvent) {
      const data = typeof event.data === 'string' ? event.data : '';
      if (!data.startsWith('{')) return;
      try {
        const parsed = JSON.parse(data) as { type?: string };
        if (parsed.type) onMessage(parsed.type);
      } catch {
        // Ignore unrelated page messages.
      }
    }
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [onMessage]);

  function assignFrame(node: HTMLIFrameElement | null): void {
    iframe.current = node;
  }

  if (Platform.OS === 'web') {
    return (
      <View style={{ flex: 1, minHeight: 560 }}>
        {createElement('iframe', {
          title: 'Secure identity verification',
          srcDoc: html,
          ref: assignFrame,
          allow: 'camera; microphone',
          style: { border: 0, width: '100%', height: '100%', minHeight: 560, background: '#070708' },
        })}
      </View>
    );
  }

  return (
    <WebView
      ref={webview}
      style={{ flex: 1, backgroundColor: '#070708' }}
      originWhitelist={['*']}
      source={{ html, baseUrl: 'https://static.sumsub.com' }}
      onMessage={(event) => {
        try {
          const parsed = JSON.parse(event.nativeEvent.data) as { type?: string };
          if (parsed.type) onMessage(parsed.type);
        } catch {
          // The SDK page only posts typed events.
        }
      }}
      javaScriptEnabled
      domStorageEnabled
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      mediaCapturePermissionGrantType="grant"
      accessibilityLabel="Secure identity verification"
    />
  );
}
