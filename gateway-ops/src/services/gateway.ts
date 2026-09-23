import type { DeviceTelemetry, GatewayApi } from '@/types/gateway'

export const MOCK_SMART_SOCKET_TELEMETRY: Omit<DeviceTelemetry, 'deviceId'> = {
  current: 1.8,
  powerUsage: 180,
}

export const MOCK_LOCK_TELEMETRY: Omit<DeviceTelemetry, 'deviceId'> = {
  battery: 86,
}

export const MOCK_CARD_POWER_TELEMETRY: Omit<DeviceTelemetry, 'deviceId'> = {
  doorMagnet: true,
}

export const MOCK_THERMOSTAT_TELEMETRY: Omit<DeviceTelemetry, 'deviceId'> = {
  indoorTemperature: 23.6,
}

export const MOCK_CURTAIN_TELEMETRY: Omit<DeviceTelemetry, 'deviceId'> = {
  openingPercentage: 42,
}

export const MOCK_KETTLE_TELEMETRY: Omit<DeviceTelemetry, 'deviceId'> = {
  waterTemperature: 86,
  current: 6.4,
  voltage: 220,
}

export const MOCK_HAIRDRYER_TELEMETRY: Omit<DeviceTelemetry, 'deviceId'> = {
  voltage: 220,
  ntcTemperature: 48.5,
  motorRpm: 8200,
  motorCurrent: 1.6,
}

export const mockGatewayApi: GatewayApi = {
  async getDeviceTelemetry(deviceId) {
    const telemetry = deviceId.endsWith('-lock')
      ? MOCK_LOCK_TELEMETRY
      : deviceId.endsWith('-card-power')
        ? MOCK_CARD_POWER_TELEMETRY
      : deviceId.endsWith('-thermostat')
          ? MOCK_THERMOSTAT_TELEMETRY
        : deviceId.endsWith('-curtain') || deviceId.endsWith('-sheer-curtain')
          ? MOCK_CURTAIN_TELEMETRY
        : deviceId.endsWith('-kettle')
          ? MOCK_KETTLE_TELEMETRY
        : deviceId.endsWith('-hairdryer')
          ? MOCK_HAIRDRYER_TELEMETRY
        : MOCK_SMART_SOCKET_TELEMETRY
    return {
      deviceId,
      ...telemetry,
    }
  },
}

// 后端接口约定：GET /api/devices/:deviceId/telemetry
export function createHttpGatewayApi(baseUrl: string): GatewayApi {
  return {
    async getDeviceTelemetry(deviceId) {
      const response = await fetch(
        `${baseUrl}/api/devices/${encodeURIComponent(deviceId)}/telemetry`,
      )
      if (!response.ok) {
        throw new Error(`获取设备遥测数据失败：${response.status}`)
      }
      return (await response.json()) as DeviceTelemetry
    },
  }
}

// 当前前端使用 mock；接入后端时替换为 createHttpGatewayApi(API_BASE_URL)。
export const gatewayApi: GatewayApi = mockGatewayApi
