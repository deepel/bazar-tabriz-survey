declare module '@turf/distance' {
  interface DistanceOptions {
    units?: 'meters' | 'kilometers' | 'miles' | 'degrees' | 'radians';
  }
  const distance: (
    from: { type: string; [key: string]: unknown },
    to: { type: string; [key: string]: unknown },
    options?: DistanceOptions
  ) => number;
  export default distance;
}