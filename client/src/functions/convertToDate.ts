export const convertToDate = (dateString: string): Date | null => {
  if (dateString === '') {
    return null
  }

  const date = new Date(dateString)

  if (isNaN(date.getTime())) {
    return null
  }

  return date
}
