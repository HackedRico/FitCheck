export interface WeatherData {
  temp: number
  feels_like: number
  rain_chance: number
  condition: string
}

const WEATHER_CODE_MAP: Record<number, string> = {
  0: 'clear sky',
  1: 'mainly clear',
  2: 'partly cloudy',
  3: 'overcast',
  45: 'foggy',
  48: 'icy fog',
  51: 'light drizzle',
  53: 'moderate drizzle',
  61: 'light rain',
  63: 'moderate rain',
  65: 'heavy rain',
  71: 'light snow',
  73: 'moderate snow',
  75: 'heavy snow',
  80: 'rain showers',
  81: 'moderate rain showers',
  95: 'thunderstorm',
}

export async function getWeather(lat: number, lng: number): Promise<WeatherData> {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,apparent_temperature,precipitation_probability,weathercode` +
    `&temperature_unit=fahrenheit`

  const res = await fetch(url, { next: { revalidate: 1800 } })
  if (!res.ok) throw new Error('Failed to fetch weather')

  const data = await res.json()
  const c = data.current

  return {
    temp: Math.round(c.temperature_2m),
    feels_like: Math.round(c.apparent_temperature),
    rain_chance: c.precipitation_probability ?? 0,
    condition: WEATHER_CODE_MAP[c.weathercode] ?? 'mixed conditions',
  }
}
