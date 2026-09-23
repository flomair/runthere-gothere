/** Navigate within the hash router (#/ and #/j/<id>). */
export const navigate = (path: string) => {
  window.location.hash = path;
  window.scrollTo({ top: 0 });
};
