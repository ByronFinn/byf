import { describe, expect, it } from 'vitest';

import { matchMediaAttachments } from '#/tui/components/media/attachment-preview';
import { ImageAttachmentStore } from '#/tui/utils/image-attachment-store';

/**
 * 输入框附件预览条的核心逻辑(与提交提取共用占位符解析):
 * - 占位符能对照 store 解析才视为附件(用户手打字面量不臆造);
 * - 顺序即文本出现顺序;
 * - 删除占位符文本 → 预览同步为空。
 */
describe('matchMediaAttachments', () => {
  it('无占位符时返回空', () => {
    const store = new ImageAttachmentStore();
    store.addImage(Buffer.from('x'), 'image/png', 10, 10);
    expect(matchMediaAttachments('hello world', store)).toEqual([]);
  });

  it('解析 store 中存在的图片占位符并按出现顺序返回', () => {
    const store = new ImageAttachmentStore();
    const img1 = store.addImage(Buffer.from('a'), 'image/png', 640, 480);
    const img2 = store.addImage(Buffer.from('b'), 'image/jpeg', 100, 200);
    const result = matchMediaAttachments(
      `看图:${img1.placeholder} 再看 ${img2.placeholder}`,
      store,
    );
    expect(result.map((a) => a.id)).toEqual([img1.id, img2.id]);
  });

  it('store 中不存在的占位符(用户手打)被跳过', () => {
    const store = new ImageAttachmentStore();
    const img = store.addImage(Buffer.from('a'), 'image/png', 10, 10);
    const result = matchMediaAttachments(`[image #999 (10×10)] ${img.placeholder}`, store);
    expect(result.map((a) => a.id)).toEqual([img.id]);
  });

  it('kind 不匹配的占位符被跳过(video 占位符不能匹配 image 附件)', () => {
    const store = new ImageAttachmentStore();
    const img = store.addImage(Buffer.from('a'), 'image/png', 10, 10);
    const result = matchMediaAttachments(`[video #${img.id} sample.mov] ${img.placeholder}`, store);
    expect(result.map((a) => a.id)).toEqual([img.id]);
  });

  it('图片与视频混合按顺序返回', () => {
    const store = new ImageAttachmentStore();
    const video = store.addVideo('video/mp4', '/tmp/sample.mov');
    const img = store.addImage(Buffer.from('a'), 'image/png', 10, 10);
    const result = matchMediaAttachments(`${video.placeholder} ${img.placeholder}`, store);
    expect(result.map((a) => a.id)).toEqual([video.id, img.id]);
  });

  it('删除占位符文本后预览解析为空', () => {
    const store = new ImageAttachmentStore();
    const img = store.addImage(Buffer.from('a'), 'image/png', 10, 10);
    expect(matchMediaAttachments(img.placeholder, store).length).toBe(1);
    expect(matchMediaAttachments('', store)).toEqual([]);
  });
});
