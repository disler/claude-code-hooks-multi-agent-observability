import { createRouter, createWebHistory } from 'vue-router';
import ExecutiveChat from '../views/ExecutiveChat.vue';
import TaskBoard from '../views/TaskBoard.vue';
import DecisionsBoard from '../views/DecisionsBoard.vue';
import CostBoard from '../views/CostBoard.vue';
import AgentMonitor from '../views/AgentMonitor.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/chat'
    },
    {
      path: '/chat',
      name: 'chat',
      component: ExecutiveChat
    },
    {
      path: '/tasks',
      name: 'tasks',
      component: TaskBoard
    },
    {
      path: '/decisions',
      name: 'decisions',
      component: DecisionsBoard
    },
    {
      path: '/cost',
      name: 'cost',
      component: CostBoard
    },
    {
      path: '/observability',
      name: 'observability',
      component: AgentMonitor
    }
  ]
});

export default router;
