let scriptLoaded = false;
let scriptLoading = false;
let loadPromise: Promise<void> | null = null;

export function loadGeetestScript(): Promise<void> {
  if (scriptLoaded) {
    return Promise.resolve();
  }

  if (scriptLoading && loadPromise) {
    return loadPromise;
  }

  scriptLoading = true;
  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://static.geetest.com/v4/gt4.js";
    script.async = true;
    script.onload = () => {
      scriptLoaded = true;
      scriptLoading = false;
      resolve();
    };
    script.onerror = () => {
      scriptLoading = false;
      loadPromise = null;
      reject(new Error("Failed to load Geetest script"));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}
