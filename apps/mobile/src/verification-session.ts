export interface VerificationSession {
  accessToken: string;
  expiresAt: string;
  language: string;
}

let session: VerificationSession | null = null;

export function setVerificationSession(value: VerificationSession | null): void {
  session = value;
}

export function getVerificationSession(): VerificationSession | null {
  return session;
}

export function sumsubWebSdkHtml(accessToken: string, language: string): string {
  const token = JSON.stringify(accessToken);
  const lang = JSON.stringify(language || 'en');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>html,body{margin:0;height:100%;background:#070708;color:#f4f4f6;font-family:sans-serif}#sumsub-websdk-container{min-height:100%}</style>
  <script src="https://static.sumsub.com/idensic/static/sns-websdk-builder.js"></script>
</head>
<body>
  <div id="sumsub-websdk-container"></div>
  <script>
    function post(message) {
      var raw = JSON.stringify(message);
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(raw);
      else window.parent.postMessage(raw, '*');
    }
    function launch(accessToken) {
      if (!window.snsWebSdk) {
        post({ type: 'sdkError' });
        return;
      }
      var sdk = window.snsWebSdk.init(accessToken, function () {
        return new Promise(function (resolve, reject) {
          var timer = setTimeout(function () { reject(new Error('expired')); }, 20000);
          window.__cyrelleResolveToken = function (next) {
            clearTimeout(timer);
            resolve(next);
          };
          post({ type: 'tokenExpired' });
        });
      }).withConf({ lang: ${lang}, theme: 'dark' })
        .withOptions({ addViewportTag: false, adaptIframeHeight: true })
        .on('idCheck.onApplicantSubmitted', function () { post({ type: 'submitted' }); })
        .on('idCheck.onApplicantResubmitted', function () { post({ type: 'submitted' }); })
        .on('idCheck.onError', function () { post({ type: 'sdkError' }); })
        .build();
      sdk.launch('#sumsub-websdk-container');
    }
    launch(${token});
  </script>
</body>
</html>`;
}
