/**
 * KAOS stat 结果,镜像 Python 的 os.stat_result 字段。
 */
export interface StatResult {
  stMode: number;
  stIno: number;
  stDev: number;
  stNlink: number;
  stUid: number;
  stGid: number;
  stSize: number;
  stAtime: number;
  stMtime: number;
  stCtime: number;
}
