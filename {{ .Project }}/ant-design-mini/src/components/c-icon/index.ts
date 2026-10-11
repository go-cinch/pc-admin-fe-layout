import { iconSource } from '../icon-source';
Component({ options: { styleIsolation: 'shared' }, properties: { name: String, tone: {type:String,value:'muted'}, variant: String, dark: Boolean, accent: String }, data: { source: '' }, observers: { 'name,tone,variant,dark,accent': function(this:any) { this.setData({source:iconSource(this.data)}) } } });
