// ============================================================================
// SHARED UTILITIES
// ============================================================================
import { MAX_TITLE_LENGTH, MAX_TEXT_LENGTH } from './config.js'

export const sanitizeInput = (value, maxLength) => {
  if (typeof value !== 'string') return value
  return value.slice(0, maxLength)
}

export const debounce = (func, delay) => {
  let timeoutId
  return (...args) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => func(...args), delay)
  }
}

export const isValidDateValue = (value) => value && !Number.isNaN(new Date(value).getTime())

export const getDaysUntil = (value) => {
  if (!isValidDateValue(value)) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const target = new Date(value); target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

export const formatDisplayDate = (value) =>
  isValidDateValue(value) ? new Date(value).toLocaleDateString() : 'No date'

export const isClosedProject = (project) =>
  ['closed', 'complete', 'completed', 'done', 'archived'].includes(String(project?.stage || '').toLowerCase())

export const getPriorityWeight = (priority) =>
  priority === 'High' ? 3 : priority === 'Medium' ? 2 : priority === 'Low' ? 1 : 0

export const clampNumber = (value, min, max, fallback) =>
  Number.isFinite(value) ? Math.min(Math.max(value, min), max) : fallback

export const getDueLabel = (dayDelta) =>
  dayDelta === null ? 'No due date' : dayDelta < 0 ? `${Math.abs(dayDelta)}d overdue` :
  dayDelta === 0 ? 'Due today' : dayDelta === 1 ? 'Due tomorrow' : `Due in ${dayDelta}d`

// CSV utilities
export const jsonToCsv = (jsonArray) => {
  if (!jsonArray || jsonArray.length === 0) return ''
  const cleanHeaders = ['name','title','priority','stage','narrative','notes','dueDate','contactName','email','phone','role','description','effort','done']
  const allKeys = Object.keys(jsonArray[0])
  const headers = cleanHeaders.filter(key => allKeys.includes(key))
  const csvRows = [headers.join(',')]
  for (const obj of jsonArray) {
    const values = headers.map(header => {
      let val = obj[header]
      if (header === 'notes' && Array.isArray(val)) val = val.length > 0 ? val[0].text : ''
      val = val === null || val === undefined ? '' : String(val)
      val = val.replace(/"/g, '""')
      if (val.search(/(\"|,|\n)/g) >= 0) val = `"${val}"`
      return val
    })
    csvRows.push(values.join(','))
  }
  return csvRows.join('\n')
}

export const csvToJson = (csvString) => {
  const lines = csvString.split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = lines[0].split(',')
  const result = []
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const row = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
    const obj = {}
    headers.forEach((header, index) => {
      let val = row[index] ? row[index].replace(/^"|"$/g, '').replace(/""/g, '"') : ''
      obj[header.trim()] = val
    })
    result.push(obj)
  }
  return result
}
