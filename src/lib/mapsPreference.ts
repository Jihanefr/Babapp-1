import { Linking, Platform } from 'react-native';

export function openInAppleMaps(lat: number, lng: number, label: string) {
  const encoded = encodeURIComponent(label);
  const url = `https://maps.apple.com/?q=${encoded}&ll=${lat},${lng}`;
  Linking.openURL(url).catch(() => {});
}

export function openInGoogleMaps(lat: number, lng: number, label: string) {
  const encoded = encodeURIComponent(label);
  const appUrl = `comgooglemaps://?q=${encoded}&center=${lat},${lng}`;
  const webUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  Linking.canOpenURL(appUrl).then((supported) =>
    Linking.openURL(supported ? appUrl : webUrl).catch(() => Linking.openURL(webUrl)),
  );
}

export function openInWaze(lat: number, lng: number) {
  const appUrl = `waze://ul?ll=${lat},${lng}&navigate=yes`;
  const webUrl = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
  Linking.canOpenURL(appUrl).then((supported) =>
    Linking.openURL(supported ? appUrl : webUrl).catch(() => Linking.openURL(webUrl)),
  );
}

export function openInDefaultMaps(lat: number, lng: number, label: string) {
  const encoded = encodeURIComponent(label);
  const url = Platform.select({
    ios: `https://maps.apple.com/?q=${encoded}&ll=${lat},${lng}`,
    android: `geo:${lat},${lng}?q=${lat},${lng}(${encoded})`,
  });
  if (url) Linking.openURL(url).catch(() => {});
}
