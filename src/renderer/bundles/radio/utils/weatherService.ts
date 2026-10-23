import { djSettings } from '@renderer/bundles/radio/store'

export type WeatherSettings = Pick<typeof djSettings, 'city' | 'weatherApiKey' | 'weatherApiHost'>
const snapshotSettings = (settings: WeatherSettings): WeatherSettings => ({ city: settings.city, weatherApiKey: settings.weatherApiKey, weatherApiHost: settings.weatherApiHost })

export interface WeatherData {
  city: string
  weather: string
  temp: string
  feelsLike?: string
  windDir?: string
  fullText: string
}

export interface CitySearchResult {
  id: string
  name: string
  adm1: string
  adm2: string
  country: string
  displayLabel: string
}

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

const CITY_CACHE_TTL_MS = 10 * 60 * 1000
const WEATHER_CACHE_TTL_MS = 15 * 60 * 1000
const REQUEST_TIMEOUT_MS = 10000

const citySearchCache = new Map<string, CacheEntry<CitySearchResult[]>>()
const weatherCache = new Map<string, CacheEntry<WeatherData>>()
const pendingCitySearches = new Map<string, Promise<CitySearchResult[]>>()
let pendingWeather: { key: string, promise: Promise<WeatherData> } | null = null

const getCached = <T>(cache: Map<string, CacheEntry<T>>, key: string): T | null => {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }
  return entry.data
}

const setCached = <T>(cache: Map<string, CacheEntry<T>>, key: string, data: T, ttlMs: number) => {
  cache.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
  })
}

const requests = new Set<AbortController>()
export const cancelWeatherRequests = () => {
  for (const controller of requests) controller.abort()
  requests.clear()
  pendingCitySearches.clear()
  pendingWeather = null
}
const fetchJson = async(url: string, apiKey?: string): Promise<any> => {
  const controller = new AbortController()
  requests.add(controller)
  const timer = setTimeout(() => { controller.abort() }, REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, { headers: apiKey ? { 'X-QW-Api-Key': apiKey.trim() } : undefined, signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } finally { clearTimeout(timer); requests.delete(controller) }
}

const getWeatherCacheKey = (settings: WeatherSettings) => [
  settings.city || '成都',
  settings.weatherApiKey?.trim() || 'free',
  settings.weatherApiHost?.trim() || '',
].join('|')

const getCityCacheKey = (keyword: string, settings: WeatherSettings) => [
  keyword,
  settings.weatherApiKey?.trim() || 'free',
  settings.weatherApiHost?.trim() || '',
].join('|')

/**
 * 城市模糊搜索 (和风 GeoAPI 城市 Lookup)
 */
export const searchCities = async(keyword: string, settings: WeatherSettings = djSettings): Promise<CitySearchResult[]> => {
  const config = snapshotSettings(settings)
  const trimKw = keyword.trim()
  if (!trimKw) return []
  const cacheKey = getCityCacheKey(trimKw, config)
  const cached = getCached(citySearchCache, cacheKey)
  if (cached) return cached

  const pending = pendingCitySearches.get(cacheKey)
  if (pending) return pending

  const promise = doSearchCities(trimKw, config).then((results) => {
    setCached(citySearchCache, cacheKey, results, CITY_CACHE_TTL_MS)
    return results
  }).finally(() => {
    if (pendingCitySearches.get(cacheKey) === promise) pendingCitySearches.delete(cacheKey)
  })
  pendingCitySearches.set(cacheKey, promise)
  return promise
}

const doSearchCities = async(trimKw: string, settings: WeatherSettings): Promise<CitySearchResult[]> => {
  const apiKey = settings.weatherApiKey
  const isCustomHost = !!settings.weatherApiHost?.trim()
  const apiHost = settings.weatherApiHost?.trim() || 'geoapi.qweather.com'
  const finalHost = (apiHost.startsWith('http') ? apiHost : `https://${apiHost}`).replace(/\/+$/, '')
  const geoPath = isCustomHost ? '/geo/v2/city/lookup' : '/v2/city/lookup'

  if (apiKey) {
    try {
      const url = `${finalHost}${geoPath}?location=${encodeURIComponent(trimKw)}&range=cn&number=10`
      const data = await fetchJson(url, apiKey)

      if (data.code === '200' && Array.isArray(data.location)) {
        return data.location.map((item: any) => {
          const adm1 = item.adm1 || ''
          const adm2 = item.adm2 || ''
          const country = item.country || '中国'
          const regionStr = [adm2, adm1].filter(Boolean).join(' · ')
          const displayLabel = regionStr ? `${item.name} (${regionStr} · ${country})` : `${item.name} (${country})`

          return {
            id: item.id,
            name: item.name,
            adm1,
            adm2,
            country,
            displayLabel,
          }
        })
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err
      console.error('和风 GeoAPI 城市搜索失败:', err)
    }
  }

  // 预设热门城市供无 Key 时检索
  const popular = [
    { id: '101010100', name: '北京', adm1: '北京市', adm2: '北京', country: '中国', displayLabel: '北京 (北京市 · 中国)' },
    { id: '101020100', name: '上海', adm1: '上海市', adm2: '上海', country: '中国', displayLabel: '上海 (上海市 · 中国)' },
    { id: '101280101', name: '广州', adm1: '广东省', adm2: '广州', country: '中国', displayLabel: '广州 (广东省 · 中国)' },
    { id: '101280601', name: '深圳', adm1: '广东省', adm2: '深圳', country: '中国', displayLabel: '深圳 (广东省 · 中国)' },
    { id: '101270101', name: '成都', adm1: '四川省', adm2: '成都', country: '中国', displayLabel: '成都 (四川省 · 中国)' },
    { id: '101210101', name: '杭州', adm1: '浙江省', adm2: '杭州', country: '中国', displayLabel: '杭州 (浙江省 · 中国)' },
    { id: '101110101', name: '西安', adm1: '陕西省', adm2: '西安', country: '中国', displayLabel: '西安 (陕西省 · 中国)' },
    { id: '101200101', name: '武汉', adm1: '湖北省', adm2: '武汉', country: '中国', displayLabel: '武汉 (湖北省 · 中国)' },
  ]
  return popular.filter(c => c.name.includes(trimKw) || c.displayLabel.includes(trimKw))
}

/**
 * 实时获取当前城市天气
 * 支持和风天气 API 以及免费实测 API 自动查询
 */
export const fetchCurrentWeather = async(force = false, settings: WeatherSettings = djSettings): Promise<WeatherData> => {
  const config = snapshotSettings(settings)
  const cacheKey = getWeatherCacheKey(config)
  const cached = getCached(weatherCache, cacheKey)
  if (cached && !force) return cached

  if (pendingWeather?.key === cacheKey) return pendingWeather.promise

  const promise = doFetchCurrentWeather(config).then((data) => {
    setCached(weatherCache, cacheKey, data, WEATHER_CACHE_TTL_MS)
    return data
  }).finally(() => {
    if (pendingWeather?.promise === promise) pendingWeather = null
  })
  pendingWeather = { key: cacheKey, promise }
  return promise
}

const doFetchCurrentWeather = async(settings: WeatherSettings): Promise<WeatherData> => {
  const city = settings.city || '成都'
  const apiKey = settings.weatherApiKey
  const isCustomHost = !!settings.weatherApiHost?.trim()
  const geoHost = settings.weatherApiHost?.trim() || 'geoapi.qweather.com'
  const weatherHost = settings.weatherApiHost?.trim() || 'devapi.qweather.com'

  const geoUrl = (geoHost.startsWith('http') ? geoHost : `https://${geoHost}`).replace(/\/+$/, '')
  const weatherUrl = (weatherHost.startsWith('http') ? weatherHost : `https://${weatherHost}`).replace(/\/+$/, '')
  const geoPath = isCustomHost ? '/geo/v2/city/lookup' : '/v2/city/lookup'

  // 1. 如果配置了和风天气 API Key，调用官方接口
  if (apiKey) {
    try {
      const geoData = await fetchJson(
        `${geoUrl}${geoPath}?location=${encodeURIComponent(city)}`, apiKey,
      )

      if (geoData.code !== '200') throw new Error(`城市查询失败（${geoData.code}），请检查 API Key、API Host 和权限`)
      if (geoData.code === '200' && geoData.location?.[0]?.id) {
        const locationId = geoData.location[0].id
        const cityName = geoData.location[0].name || city

        const weatherData = await fetchJson(
          `${weatherUrl}/v7/weather/now?location=${locationId}`, apiKey,
        )

        if (weatherData.code !== '200') throw new Error(`实时天气查询失败（${weatherData.code}），请检查订阅和权限`)
        if (weatherData.code === '200' && weatherData.now) {
          const now = weatherData.now
          const weatherText = now.text
          const tempText = `${now.temp}°C`

          return {
            city: cityName,
            weather: weatherText,
            temp: tempText,
            feelsLike: `${now.feelsLike}°C`,
            windDir: `${now.windDir} ${now.windScale}级`,
            fullText: `${cityName} | ${weatherText} ${tempText}`,
          }
        }
      }
      throw new Error('接口未返回有效的城市或实时天气数据')
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err
      throw new Error(`和风天气：${(err as Error).message}`)
    }
  }

  // 2. 自动免费实时天气接口 Lookup (免 Key 真实天气查询)
  try {
    const data = await fetchJson(`https://wttr.in/${encodeURIComponent(city)}?format=j1`)
    const current = data.current_condition?.[0]
    if (current) {
      const tempC = `${current.temp_C}°C`
      const weatherDesc = current.lang_zh?.[0]?.value || current.weatherDesc?.[0]?.value || '晴'
      return {
        city,
        weather: weatherDesc,
        temp: tempC,
        fullText: `${city} | ${weatherDesc} ${tempC}`,
      }
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    console.warn('wttr.in 实时天气请求失败:', err)
  }

  throw new Error('实时天气暂不可用，请稍后重试')
}
