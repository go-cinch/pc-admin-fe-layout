<script setup lang="ts">
const props=withDefaults(defineProps<{action?:string;arg?:string;kind?:string;disabled?:boolean;loading?:boolean}>(),{action:'',arg:'',kind:'outline'});
const emit=defineEmits<{press:[value:{action:string;arg:string}]}>();
function press(){if(!props.disabled&&!props.loading)emit('press',{action:props.action,arg:props.arg})}
</script><template><view class="c-button"><wd-button :type="kind==='danger'?'danger':kind==='primary'?'primary':'info'" :variant="kind==='text'?'text':kind==='primary'?'base':'plain'" :disabled="disabled" :loading="loading" @click="press"><slot /></wd-button></view></template>
