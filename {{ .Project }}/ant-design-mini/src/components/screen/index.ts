import { Screen } from '../../core/screen';
import { client, variant } from '../../runtime';
const definition: any = {
  options: { styleIsolation: 'shared' },
  properties: { route: { type: String, value: '/dashboard/overview' }, query: { type: Object, value: {} } },
  data: { vm: null },
  lifetimes: {
    ready(this: any) { this.screen = new Screen(client, variant, vm => this.setData({ vm })); void this.screen.start(this.properties.route, this.properties.query) },
    detached(this: any) { this.screen?.dispose() },
  },
  pageLifetimes: { show(this: any) { this.screen?.show() }, hide(this: any) { this.screen?.hide() } },
  methods: {
    onAction(this: any, e: any) { const data = e.currentTarget.dataset; void this.screen.action(e.detail?.action || data.a, String(e.detail?.arg ?? data.v ?? '')) },
    onInput(this: any, e: any) { this.screen.input(e.detail.name, e.detail.value) },
    onSearchBlur(this: any) { this.screen.blurSearch() },
    onSliderStart(this: any, e: any) { const x = e.touches[0].clientX; this.createSelectorQuery().select('#slider-track').boundingClientRect((box: any) => { if (box) this.screen.beginSlider(x, box.width) }).exec() },
    onSliderMove(this: any, e: any) { this.screen.moveSlider(e.touches[0].clientX) },
    onSliderEnd(this: any) { void this.screen.endSlider() },
    onSliderCancel(this: any) { this.screen.resetSlider(); this.screen.emit() },
    onPoint(this: any, e: any) { const point=e.detail; this.createSelectorQuery().select('#point-captcha').boundingClientRect((box: any) => { if(box)void this.screen.point(point.x-box.left,point.y-box.top,box.width,box.height) }).exec() },
  },
};
Component(definition);
