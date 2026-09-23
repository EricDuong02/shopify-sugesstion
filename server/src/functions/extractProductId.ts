export const extractProductId = (gid: string) => {
  return gid.split('/').pop()!
}
