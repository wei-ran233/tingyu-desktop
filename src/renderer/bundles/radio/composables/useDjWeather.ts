/**
 * useDjWeather — 天气感知 composable
 *
 * 封装天气获取、城市搜索、天气类型检测逻辑
 */

import { ref, computed } from '@common/utils/vueTools'
import { djSettings } from '@renderer/bundles/radio/store'
import { fetchCurrentWeather, searchCities } from '@renderer/bundles/radio/utils/weatherService'
import { detectWeatherType } from '@renderer/bundles/radio/utils/templateEngine'
import type { WeatherData, WeatherType, CitySearchResult } from '@renderer/bundles/radio/utils/types'

// 模块级单例天气状态（页面卸载后仍存活，供 DJ 自动连播跨页面使用）
const weatherData = ref<WeatherData>({
  city: '北京',
  weather: '天气待更新',
  temp: '',
  fullText: '天气待更新',
  type: 'sunny',
})
const isLoading = ref(false)
const error = ref<string | null>(null)

const city = computed(() => djSettings.city || '北京')
const weatherType = computed<WeatherType>(() => weatherData.value.type)
const weatherDisplay = computed(() => `${weatherData.value.weather} ${weatherData.value.temp}`)
const fullWeatherText = computed(() => weatherData.value.fullText)

export const getCurrentDjWeatherContext = (): { text: string, type: WeatherType } => ({
  text: weatherDisplay.value,
  type: weatherType.value,
})

export function useDjWeather() {
  /** 更新天气 */
  const refreshWeather = async() => {
    isLoading.value = true
    error.value = null
    try {
      const data = await fetchCurrentWeather()
      weatherData.value = {
        ...data,
        type: detectWeatherType(data.weather),
      }
    } catch (e) {
      error.value = (e as Error).message || '获取天气失败'
      weatherData.value = {
        city: city.value,
        weather: error.value,
        temp: '',
        fullText: `${city.value} | ${error.value}`,
        type: 'sunny',
      }
    } finally {
      isLoading.value = false
    }
  }

  /** 搜索城市 */
  const searchCity = async(keyword: string): Promise<CitySearchResult[]> => {
    if (!keyword.trim()) return []
    try {
      return await searchCities(keyword)
    } catch {
      return []
    }
  }

  return {
    weatherData,
    isLoading,
    error,
    city,
    weatherType,
    weatherDisplay,
    fullWeatherText,
    refreshWeather,
    searchCity,
  }
}
