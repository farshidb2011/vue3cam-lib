import { reactive } from "vue";

export const GlobalState = reactive({
  permissionState: "prompt",
  stream: null as MediaStream | null,
  capturing: false
});
