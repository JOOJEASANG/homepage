// Track an uploaded-but-unsent object by consultation, not just by the active UI.
export function createChatUploadSession(removeObject, onError = () => {}) {
  let current = null;
  async function remove(path) {
    try { await removeObject(path); }
    catch (error) { if (error?.code !== 'storage/object-not-found') onError(error); }
  }
  function discard() {
    const previous = current;
    current = null;
    if (previous?.ready) void remove(previous.path);
  }
  return {
    begin(quoteId, path) { discard(); current = {quoteId,path,ready:false}; return current; },
    isCurrent(token) { return current === token; },
    discard,
    async complete(token) {
      if (current !== token) { await remove(token.path); return false; }
      token.ready = true; return true;
    },
    async failed(token, objectUploaded=false) {
      if (current === token) current = null;
      if (objectUploaded) await remove(token.path);
    },
    sent() { current = null; }
  };
}
export function uniqueUploadName(name) {
  const safe = String(name || 'file').replace(/[^a-zA-Z0-9._가-힣 -]/g,'_').slice(0,200) || 'file';
  return Date.now()+'_'+(globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2))+'_'+safe;
}
