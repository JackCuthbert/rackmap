import type { ApiModelResponse } from '../domain/types'

export async function fetchModel(): Promise<ApiModelResponse> {
  const response = await fetch('/api/model')
  return response.json()
}
