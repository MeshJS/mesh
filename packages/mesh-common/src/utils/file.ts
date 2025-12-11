export async function getFile(url: string) {
  if (typeof XMLHttpRequest !== "undefined") {
    var Httpreq = new XMLHttpRequest();
    Httpreq.open("GET", url, false);
    Httpreq.send(null);
    return Httpreq.responseText;
  } else {
    const res = await fetch(url);
    return res.text();
  }
}
