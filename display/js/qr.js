const mkQR = (url, size = 420) => {
  const u = new URL("https://api.qrserver.com/v1/create-qr-code/");
  u.searchParams.set("size", `${size}x${size}`);
  u.searchParams.set("data", url);
  u.searchParams.set("margin", "10");
  return u.toString();
};

export const createQRController = ({ qrScreen, gameScreen, hostImg, buzzerImg }) => {
  let hostUrl = "";
  let buzzerUrl = "";

  const setHost = (url) => {
    hostUrl = (url ?? "").toString();
    if (hostUrl) hostImg.src = mkQR(hostUrl);
  };

  const setBuzzer = (url) => {
    buzzerUrl = (url ?? "").toString();
    if (buzzerUrl) buzzerImg.src = mkQR(buzzerUrl);
  };

  const show = () => {
    qrScreen.classList.remove("hidden");
    qrScreen.setAttribute("aria-hidden", "false");
    gameScreen.classList.add("hidden");
  };

  const hide = () => {
    qrScreen.classList.add("hidden");
    qrScreen.setAttribute("aria-hidden", "true");
    gameScreen.classList.remove("hidden");
  };

  return { setHost, setBuzzer, show, hide, get: () => ({ hostUrl, buzzerUrl }) };
};
