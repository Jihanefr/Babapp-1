const API_KEY = process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY!;

const BASE_URL = 'https://api.openweathermap.org/data/2.5';

export interface WeatherData {
  temp: number;
  feels_like: number;
  description: string;
  icon: string;
  city: string;
  humidity: number;
  wind_speed: number;
}

export async function getWeather(
  lat: number,
  lon: number,
): Promise<WeatherData | null> {
  try {
    const url = `${BASE_URL}/weather?lat=${lat}&lon=${lon}&units=metric&appid=${API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    return {
      temp: Math.round(data.main.temp),
      feels_like: Math.round(data.main.feels_like),
      description: data.weather[0]?.description ?? '',
      icon: data.weather[0]?.icon ?? '01d',
      city: data.name,
      humidity: data.main.humidity,
      wind_speed: Math.round(data.wind.speed * 3.6),
    };
  } catch {
    return null;
  }
}

export function getWeatherIconUrl(icon: string) {
  return `https://openweathermap.org/img/wn/${icon}@2x.png`;
}

export type WeatherLayer = 'temp_new' | 'clouds_new' | 'precipitation_new' | 'wind_new';

export const WEATHER_LAYERS: { key: WeatherLayer; label: string; icon: string }[] = [
  { key: 'temp_new', label: 'Temperature', icon: 'thermometer-outline' },
  { key: 'clouds_new', label: 'Clouds', icon: 'cloud-outline' },
  { key: 'precipitation_new', label: 'Rain', icon: 'rainy-outline' },
  { key: 'wind_new', label: 'Wind', icon: 'flag-outline' },
];

export function getWeatherTileUrl(layer: WeatherLayer) {
  return `https://tile.openweathermap.org/map/${layer}/{z}/{x}/{y}.png?appid=${API_KEY}`;
}
