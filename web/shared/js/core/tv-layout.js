// Ustawia wariant prezentacyjny ekranów, które mogą być widoczne na TV.
const tvUserAgent = /Smart[- ]?TV|HbbTV|NetCast|Web[O0]S|Tizen|Android[ /_-]?TV|Google[ /_-]?TV|BRAVIA|Viera|AFT\w+|AppleTV|CrKey|Roku|TV Safari/i;

if (tvUserAgent.test(navigator.userAgent || "")) {
  document.documentElement.dataset.tvLayout = "true";
}
