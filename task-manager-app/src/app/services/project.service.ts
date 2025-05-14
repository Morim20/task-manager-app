// src/app/services/project.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { Project } from '../models/project.model';
import { v4 as uuidv4 } from 'uuid';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import firebase from 'firebase/compat/app';

const STORAGE_KEY = 'todo-maru-projects';

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private projects = new BehaviorSubject<Project[]>([]);

  constructor(
    private firestore: AngularFirestore,
    private auth: AngularFireAuth
  ) {
    this.initializeProjects();
  }

  private async initializeProjects() {
    const user = await this.auth.currentUser;
    if (!user) {
      this.projects.next([]);
      return;
    }

    console.log('Initializing projects from Firestore...');
    // Firestoreからプロジェクトを取得
    const projectsRef = this.firestore.collection(`users/${user.uid}/projects`);
    const snapshot = await projectsRef.get().toPromise();
    const projects: Project[] = [];
    snapshot?.forEach(docSnap => {
      const data = docSnap.data() as any;
      console.log('Retrieved project from Firestore:', data);
      projects.push({
        ...data,
        id: docSnap.id,
        createdAt: data.createdAt instanceof firebase.firestore.Timestamp ? data.createdAt.toDate() : new Date(),
        startDate: data.startDate instanceof firebase.firestore.Timestamp ? data.startDate.toDate() : undefined,
        dueDate: data.dueDate instanceof firebase.firestore.Timestamp ? data.dueDate.toDate() : undefined,
        tasks: data.tasks || []
      });
    });
    console.log('Total projects retrieved:', projects.length);

    // Firestoreにプロジェクトがない場合、ローカルストレージから移行
    if (projects.length === 0) {
      const localProjects = this.loadFromLocalStorage();
      if (localProjects && localProjects.length > 0) {
        // ローカルストレージのデータをFirestoreに移行
        for (const project of localProjects) {
          await this.add(project);
        }
        projects.push(...localProjects);
        // 移行完了後、ローカルストレージのデータを削除
        localStorage.removeItem(STORAGE_KEY);
      } else {
        // デフォルトのプロジェクトを作成
        const defaultProject: Project = {
          id: uuidv4(),
          name: '個人',
          type: 'personal',
          tasks: [],
          createdAt: new Date()
        };
        await this.add(defaultProject);
        projects.push(defaultProject);
      }
    }

    this.projects.next(projects);
  }

  private loadFromLocalStorage(): Project[] {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    
    const projects = JSON.parse(raw) as Project[];
    return projects.map(project => ({
      ...project,
      createdAt: new Date(project.createdAt),
      startDate: project.startDate ? new Date(project.startDate) : undefined,
      dueDate: project.dueDate ? new Date(project.dueDate) : undefined
    }));
  }

  getAll(): Observable<Project[]> {
    return this.projects.asObservable();
  }

  getProjects(): Observable<Project[]> {
    return this.projects.asObservable();
  }

  async add(project: Project): Promise<void> {
    const user = await this.auth.currentUser;
    if (!user) return;

    const projectData = {
      ...project,
      createdAt: firebase.firestore.Timestamp.fromDate(project.createdAt),
      startDate: project.startDate ? firebase.firestore.Timestamp.fromDate(project.startDate) : null,
      dueDate: project.dueDate ? firebase.firestore.Timestamp.fromDate(project.dueDate) : null,
      tasks: project.tasks || []
    };

    console.log('Saving project to Firestore:', projectData);
    const projectRef = this.firestore.doc(`users/${user.uid}/projects/${project.id}`);
    await projectRef.set(projectData);
    console.log('Project saved successfully');
    
    const currentProjects = this.projects.getValue();
    this.projects.next([...currentProjects, project]);
  }

  async remove(id: string): Promise<void> {
    const user = await this.auth.currentUser;
    if (!user) return;

    const projectRef = this.firestore.doc(`users/${user.uid}/projects/${id}`);
    await projectRef.delete();

    const currentProjects = this.projects.getValue();
    this.projects.next(currentProjects.filter(p => p.id !== id));
  }

  async getProjectById(id: string): Promise<Project | undefined> {
    const user = await this.auth.currentUser;
    if (!user) return undefined;

    const projectRef = this.firestore.doc(`users/${user.uid}/projects/${id}`);
    const docSnap = await projectRef.get().toPromise();
    
    if (docSnap?.exists) {
      const data = docSnap.data() as any;
      return {
        ...data,
        id: docSnap.id,
        createdAt: data.createdAt instanceof firebase.firestore.Timestamp ? data.createdAt.toDate() : new Date(),
        startDate: data.startDate instanceof firebase.firestore.Timestamp ? data.startDate.toDate() : undefined,
        dueDate: data.dueDate instanceof firebase.firestore.Timestamp ? data.dueDate.toDate() : undefined,
        tasks: data.tasks || []
      };
    }
    return undefined;
  }

  async updateProject(updatedProject: Project): Promise<void> {
    const user = await this.auth.currentUser;
    if (!user) return;

    const projectData = {
      ...updatedProject,
      createdAt: firebase.firestore.Timestamp.fromDate(updatedProject.createdAt),
      startDate: updatedProject.startDate ? firebase.firestore.Timestamp.fromDate(updatedProject.startDate) : null,
      dueDate: updatedProject.dueDate ? firebase.firestore.Timestamp.fromDate(updatedProject.dueDate) : null,
      tasks: updatedProject.tasks || []
    };

    const projectRef = this.firestore.doc(`users/${user.uid}/projects/${updatedProject.id}`);
    await projectRef.set(projectData);

    const currentProjects = this.projects.getValue();
    const index = currentProjects.findIndex(p => p.id === updatedProject.id);
    if (index !== -1) {
      currentProjects[index] = updatedProject;
      this.projects.next([...currentProjects]);
    }
  }

  async addProject(name: string, type: 'personal' | 'team'): Promise<void> {
    const newProject: Project = {
      id: uuidv4(),
      name,
      type,
      tasks: [],
      createdAt: new Date()
    };
    await this.add(newProject);
  }

  async update(project: Project): Promise<void> {
    await this.updateProject(project);
  }

  async delete(id: string): Promise<void> {
    await this.remove(id);
  }
}
