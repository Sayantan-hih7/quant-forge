export const cadenceLabel = (value: string) => value === 'daily' ? 'Daily close' : `Every ${value.replace('m', ' min')}`;
