import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { ProjectService } from '../../services/project.service';
import { Project } from '../../models/project.model';
import { Task } from '../../models/task.model';

@Component({
  selector: 'app-personal-projects',
  templateUrl: './personal-projects.component.html',
  styleUrls: ['./personal-projects.component.scss'],
  standalone: true,
  imports: [CommonModule, MatCardModule, MatListModule]
})
export class PersonalProjectsComponent implements OnInit {
  project?: Project;
  tasks: Task[] = [];

  constructor(private projectSvc: ProjectService) {}

  ngOnInit() {
    this.projectSvc.getProjects().subscribe((projects: Project[]) => {
      this.project = projects.find((p: Project) => p.name === '個人');
      if (this.project) {
        this.tasks = this.project.tasks || [];
      }
    });
  }
} 